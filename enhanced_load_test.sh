#!/bin/bash
# Enhanced load test script with DM support and state persistence
# USAGE: ./enhanced_load_test.sh <INBOX_ID> [NETWORK] [INTERVAL] [DURATION] [NUM_GROUPS] [MESSAGES_PER_BATCH] [TEST_ID] [NUM_DMS] [GROUP_SIZE]

set -eou pipefail

if ! jq --version &>/dev/null; then echo "must install jq"; fi

if [ $# -lt 1 ]; then
    echo "Error: INBOX_ID is required"
    echo "Usage: $0 <INBOX_ID> [NETWORK] [INTERVAL] [DURATION] [NUM_GROUPS] [MESSAGES_PER_BATCH] [TEST_ID] [NUM_DMS] [GROUP_SIZE]"
    exit 1
fi

INBOX_ID=$1
NETWORK=${2-"dev"}
INTERVAL=${3-1}
DURATION=${4-30}
NUM_GROUPS=${5-5}
MESSAGES_PER_GROUP_PER_BATCH=${6-3}
TEST_ID=${7-"test_$(date +%s)"}
NUM_DMS=${8-5}  # Number of DM conversations (2-person groups)
GROUP_SIZE=${9-10}  # Number of members in each group (excluding the target inbox)

CMD="${XDBG_PATH:-./target/release/xdbg} -b $NETWORK"

# State files
STATE_FILE="test_state_${TEST_ID}.json"
RESULTS_FILE="results_${TEST_ID}.json"
LOGS_FILE="logs_${TEST_ID}.txt"

echo "🚀 Starting Enhanced XMTP Load Test" | tee $LOGS_FILE
echo "Test ID: $TEST_ID" | tee -a $LOGS_FILE
echo "Inbox ID: $INBOX_ID" | tee -a $LOGS_FILE
echo "Network: $NETWORK" | tee -a $LOGS_FILE
echo "Duration: ${DURATION}s" | tee -a $LOGS_FILE
echo "Interval between batches: ${INTERVAL}s" | tee -a $LOGS_FILE
echo "Groups: $NUM_GROUPS (size: $GROUP_SIZE members each)" | tee -a $LOGS_FILE
echo "DMs: $NUM_DMS" | tee -a $LOGS_FILE
echo "Messages per conversation per batch: $MESSAGES_PER_GROUP_PER_BATCH" | tee -a $LOGS_FILE
echo "State file: $STATE_FILE" | tee -a $LOGS_FILE
echo "----------------------------------------" | tee -a $LOGS_FILE

# Record start time
START_TIME=$(date +%s)
START_TIME_ISO=$(date -Iseconds)

# Initialize global counters
TOTAL_MESSAGES=0
CLEANUP_DONE=false

# Function to initialize state file
initialize_state() {
    cat > $STATE_FILE << EOF
{
  "testId": "$TEST_ID",
  "conversations": [],
  "lastUpdated": $(date +%s),
  "network": "$NETWORK",
  "inboxId": "$INBOX_ID"
}
EOF
    echo "📄 Initialized state file: $STATE_FILE" | tee -a $LOGS_FILE
}

# Function to load state
load_state() {
    if [ -f "$STATE_FILE" ]; then
        echo "📂 Loading existing state from $STATE_FILE" | tee -a $LOGS_FILE
        return 0
    else
        echo "📄 No existing state found, will create new" | tee -a $LOGS_FILE
        return 1
    fi
}

# Function to save conversation to state
save_conversation() {
    local conv_id=$1
    local conv_type=$2
    local member_count=$3
    
    # Create conversation object
    local conv_json=$(cat << EOF
{
  "id": "$conv_id",
  "type": "$conv_type", 
  "memberCount": $member_count,
  "createdAt": $(date +%s)
}
EOF
)
    
    # Add to state file
    local temp_file=$(mktemp)
    jq ".conversations += [$conv_json]" "$STATE_FILE" > "$temp_file" && mv "$temp_file" "$STATE_FILE"
    echo "💾 Saved $conv_type conversation: $conv_id" | tee -a $LOGS_FILE
}

# Function to update state timestamp
update_state() {
    local temp_file=$(mktemp)
    jq ".lastUpdated = $(date +%s)" "$STATE_FILE" > "$temp_file" && mv "$temp_file" "$STATE_FILE"
}

# Function to get conversation IDs from state
get_existing_conversations() {
    if [ -f "$STATE_FILE" ]; then
        jq -r '.conversations[].id' "$STATE_FILE" 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Function to get conversation count from state
get_conversation_count() {
    if [ -f "$STATE_FILE" ]; then
        jq '.conversations | length' "$STATE_FILE" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}


# Initialize state for this test
initialize_state

# Always clear for fresh start (GitHub Actions is stateless anyway)
echo "🔧 Clearing and initializing xdbg (fresh start)..." | tee -a $LOGS_FILE
${XDBG_PATH:-./target/release/xdbg} --clear 2>&1 | tee -a $LOGS_FILE
$CMD --clear 2>&1 | tee -a $LOGS_FILE

# Test if xdbg supports DM creation
if [ $NUM_DMS -gt 0 ]; then
    echo "🔍 Testing xdbg DM support..." | tee -a $LOGS_FILE
    DM_HELP_OUTPUT=$($CMD generate --help 2>&1 | grep -i "dm\|entity" || true)
    echo "  Available entities: $DM_HELP_OUTPUT" | tee -a $LOGS_FILE
    
    # Test if dm is a valid entity
    if ! $CMD generate --help 2>&1 | grep -q "dm"; then
        echo "  ⚠️  xdbg may not support dm entity - this version may not have DM support" | tee -a $LOGS_FILE
    else
        echo "  ✅ xdbg supports dm entity" | tee -a $LOGS_FILE
    fi
fi

# Generate identities for group members
TOTAL_CONVERSATIONS=$((NUM_GROUPS + NUM_DMS))
IDENTITIES_NEEDED=$((TOTAL_CONVERSATIONS * 10 + 10))  # Extra identities for variety
echo "🆔 Generating $IDENTITIES_NEEDED identities for $TOTAL_CONVERSATIONS total conversations..." | tee -a $LOGS_FILE
echo "   ($NUM_GROUPS groups + $NUM_DMS DMs)" | tee -a $LOGS_FILE
$CMD generate --entity identity --amount $IDENTITIES_NEEDED 2>&1 | tee -a $LOGS_FILE

# Create group conversations with customizable size
if [ $NUM_GROUPS -gt 0 ]; then
    # Calculate invitees (group size minus 1 for the creator, target will be added separately)
    INVITEES=$((GROUP_SIZE - 1))
    echo "👥 Creating $NUM_GROUPS group conversations ($GROUP_SIZE members each after adding target)..." | tee -a $LOGS_FILE
    for i in $(seq 1 $NUM_GROUPS); do
        echo "  Creating group $i/$NUM_GROUPS ($INVITEES initial members, target will be added later)" | tee -a $LOGS_FILE
        echo "  Debug: Running command: $CMD generate --entity group --amount 1 --invite $INVITEES" | tee -a $LOGS_FILE
        
        # Capture group creation output to extract group ID for renaming
        GROUP_OUTPUT=$($CMD generate --entity group --amount 1 --invite $INVITEES 2>&1 | tee -a $LOGS_FILE)
        
        # Try to extract group ID from the naming output and rename it
        # Look for the group ID in the naming success message
        GROUP_ID=$(echo "$GROUP_OUTPUT" | grep -o "[a-f0-9]\{32\}" | head -1 || echo "")
        if [ ! -z "$GROUP_ID" ]; then
            GROUP_NAME="group-$i-$(date +%s)"  # Use group number and timestamp
            echo "🏷️  Attempting to rename group $GROUP_ID to: $GROUP_NAME" | tee -a $LOGS_FILE
            
            # Try different naming approaches
            set +e
            # Try method 1: modify with set-name
            NAME_OUTPUT=$($CMD modify --group-id "$GROUP_ID" set-name "$GROUP_NAME" 2>&1 || echo "METHOD1_FAILED")
            NAME_RESULT=$?
            
            if [ $NAME_RESULT -ne 0 ]; then
                # Try method 2: modify without --group-id
                NAME_OUTPUT=$($CMD modify "$GROUP_ID" set-name "$GROUP_NAME" 2>&1 || echo "METHOD2_FAILED")
                NAME_RESULT=$?
            fi
            
            if [ $NAME_RESULT -ne 0 ]; then
                # Try method 3: using update-metadata or similar
                NAME_OUTPUT=$($CMD modify "$GROUP_ID" update-metadata --name "$GROUP_NAME" 2>&1 || echo "METHOD3_FAILED")
                NAME_RESULT=$?
            fi
            set -e
            
            if [ $NAME_RESULT -eq 0 ]; then
                echo "✅ Successfully renamed group to: $GROUP_NAME" | tee -a $LOGS_FILE
            else
                echo "ℹ️  Group renaming not supported: $NAME_OUTPUT" | tee -a $LOGS_FILE
            fi
        else
            echo "ℹ️  Could not extract group ID for renaming" | tee -a $LOGS_FILE
        fi
        
        # Group creation completed
    done
fi

# Create DM conversations (true 2-person DM conversations)
if [ $NUM_DMS -gt 0 ]; then
    echo "💬 Creating $NUM_DMS true DM conversations (2 members each)..." | tee -a $LOGS_FILE
    for i in $(seq 1 $NUM_DMS); do
        echo "  Creating DM $i/$NUM_DMS with target inbox $INBOX_ID" | tee -a $LOGS_FILE
        echo "  Debug: Running command: $CMD generate --entity dm --amount 1 --target-inbox $INBOX_ID" | tee -a $LOGS_FILE
        
        # Try to create DM and capture both stdout and stderr
        set +e  # Temporarily disable exit on error
        DM_OUTPUT=$($CMD generate --entity dm --amount 1 --target-inbox $INBOX_ID 2>&1)
        DM_EXIT_CODE=$?
        set -e  # Re-enable exit on error
        
        echo "$DM_OUTPUT" | tee -a $LOGS_FILE
        
        if [ $DM_EXIT_CODE -ne 0 ]; then
            echo "  ❌ DM creation failed with exit code $DM_EXIT_CODE" | tee -a $LOGS_FILE
            echo "  Full error output:" | tee -a $LOGS_FILE
            echo "$DM_OUTPUT" | tee -a $LOGS_FILE
            
            # Fallback to creating 2-person group
            echo "  🔄 Falling back to creating 2-person group..." | tee -a $LOGS_FILE
            set +e
            FALLBACK_OUTPUT=$($CMD generate --entity group --amount 1 --invite 0 2>&1)
            FALLBACK_EXIT_CODE=$?
            set -e
            
            echo "$FALLBACK_OUTPUT" | tee -a $LOGS_FILE
            
            if [ $FALLBACK_EXIT_CODE -eq 0 ]; then
                echo "  ✅ Fallback: Created 2-person group as DM substitute" | tee -a $LOGS_FILE
            else
                echo "  ❌ Fallback also failed with exit code $FALLBACK_EXIT_CODE" | tee -a $LOGS_FILE
            fi
        else
            echo "  ✅ DM $i created successfully" | tee -a $LOGS_FILE
        fi
    done
fi

# Export and save all conversations to state
EXPORT=$(mktemp)
echo "📋 Exporting all conversations to state..." | tee -a $LOGS_FILE
$CMD export --entity group --out $EXPORT 2>&1 | tee -a $LOGS_FILE

# Process exported groups and save to state
ALL_GROUP_IDS=($(jq -r '.[].id' $EXPORT))
TOTAL_CONVOS=${#ALL_GROUP_IDS[@]}

echo "📊 Total conversations found: $TOTAL_CONVOS" | tee -a $LOGS_FILE

# Save all conversations to state - classify by testing each conversation
GROUPS_SAVED=0
DMS_SAVED=0

for group_id in "${ALL_GROUP_IDS[@]}"; do
    # Get member count from export data
    MEMBER_COUNT=$(jq -r ".[] | select(.id == \"$group_id\") | .memberSize" $EXPORT)
    
    echo "  Processing conversation ${group_id:0:8}... (memberSize: $MEMBER_COUNT)" | tee -a $LOGS_FILE
    
    # Test if this is a DM by trying to add our inbox to it
    # DMs will fail with "cannot change metadata of DM"
    # Groups will either succeed or fail for other reasons
    set +e  # Temporarily disable exit on error
    TEST_OUTPUT=$($CMD modify --inbox-id $INBOX_ID add-external "$group_id" 2>&1)
    TEST_RESULT=$?
    set -e  # Re-enable exit on error
    
    # Check if the error indicates this is a DM
    if echo "$TEST_OUTPUT" | grep -q "cannot change metadata of DM"; then
        # This is a DM
        save_conversation "$group_id" "dm" 2
        DMS_SAVED=$((DMS_SAVED + 1))
        echo "💾 Saved dm conversation: $group_id" | tee -a $LOGS_FILE
        echo "    Classified as DM ($DMS_SAVED/$NUM_DMS)" | tee -a $LOGS_FILE
    else
        # This is a group (either modify succeeded or failed for other reasons)
        save_conversation "$group_id" "group" "$MEMBER_COUNT"
        GROUPS_SAVED=$((GROUPS_SAVED + 1))
        echo "💾 Saved group conversation: $group_id" | tee -a $LOGS_FILE
        echo "    Classified as GROUP ($GROUPS_SAVED/$NUM_GROUPS)" | tee -a $LOGS_FILE
        
        # If adding succeeded, we're done. If it failed for other reasons, we'll try again later
        if echo "$TEST_OUTPUT" | grep -q "Member added as Super Admin"; then
            echo "    ✅ Target inbox already added to this group" | tee -a $LOGS_FILE
        fi
    fi
done

echo "💾 Total conversations for load test: $GROUPS_SAVED groups, $DMS_SAVED DMs" | tee -a $LOGS_FILE

# Add the specified inbox to group conversations that don't already have it
# DMs already have the target inbox included during creation
echo "➕ Adding inbox $INBOX_ID to group conversations (if not already added)..." | tee -a $LOGS_FILE

# Add to groups only by reading the classification from state file
GROUP_IDS_FROM_STATE=$(jq -r '.conversations[] | select(.type == "group") | .id' "$STATE_FILE")
DM_IDS_FROM_STATE=$(jq -r '.conversations[] | select(.type == "dm") | .id' "$STATE_FILE")

GROUP_COUNT=0
GROUPS_UPDATED=0
for group_id in $GROUP_IDS_FROM_STATE; do
    GROUP_COUNT=$((GROUP_COUNT + 1))
    echo "  Checking group $GROUP_COUNT (ID: ${group_id:0:8}...)" | tee -a $LOGS_FILE
    
    # Try to add to group and capture the result properly
    set +e  # Temporarily disable exit on error
    ADD_OUTPUT=$($CMD modify --inbox-id $INBOX_ID add-external "$group_id" 2>&1)
    ADD_RESULT=$?
    set -e  # Re-enable exit on error
    
    if [ $ADD_RESULT -eq 0 ]; then
        echo "$ADD_OUTPUT" | tee -a $LOGS_FILE
        GROUPS_UPDATED=$((GROUPS_UPDATED + 1))
    elif echo "$ADD_OUTPUT" | grep -q "already a member"; then
        echo "    ✅ Target inbox already in this group" | tee -a $LOGS_FILE
    else
        echo "$ADD_OUTPUT" | tee -a $LOGS_FILE
        echo "  ⚠️  Failed to add to group" | tee -a $LOGS_FILE
    fi
done

DM_COUNT=0
for dm_id in $DM_IDS_FROM_STATE; do
    DM_COUNT=$((DM_COUNT + 1))
    echo "  Skipping DM $DM_COUNT (ID: ${dm_id:0:8}...) - already has target inbox" | tee -a $LOGS_FILE
done

echo "✅ DMs already include target inbox from creation, $GROUPS_UPDATED groups updated with target inbox" | tee -a $LOGS_FILE

rm -f $EXPORT
update_state

TOTAL_CONVOS=${#ALL_GROUP_IDS[@]}
echo "✅ Using $TOTAL_CONVOS conversations for load testing" | tee -a $LOGS_FILE

if [ $TOTAL_CONVOS -eq 0 ]; then
    echo "❌ No conversations available for testing" | tee -a $LOGS_FILE
    exit 1
fi

# Count conversation types from state for display
ACTUAL_GROUPS=$GROUPS_SAVED
ACTUAL_DMS=$DMS_SAVED

# Function to send messages to all conversations
send_messages_to_all_conversations() {
    # Send messages to all conversations (no need to specify group ID)
    # Each call sends 1 message to all conversations
    # Must be sequential - xdbg can't handle parallel database access
    for msg_num in $(seq 1 $MESSAGES_PER_GROUP_PER_BATCH); do
        # Suppress "No identity with inbox id" errors for external inbox
        $CMD generate --entity message --amount 1 2>&1 | grep -v "No identity with inbox id" | tee -a $LOGS_FILE || true
    done
}

# Global variable to track if we should continue running
KEEP_RUNNING=true

# Trap for timeout
timeout_handler() {
    echo "⏰ Test duration reached, stopping..." | tee -a $LOGS_FILE
    KEEP_RUNNING=false
}

# Function to handle cleanup and exit
cleanup_and_exit() {
    # Prevent multiple executions
    if [ "${CLEANUP_DONE:-false}" = "true" ]; then
        exit 0
    fi
    CLEANUP_DONE=true
    
    local END_TIME=$(date +%s)
    local END_TIME_ISO=$(date -Iseconds)
    local ACTUAL_DURATION=$((END_TIME - START_TIME))
    
    echo "----------------------------------------" | tee -a $LOGS_FILE
    echo "🎉 Load test completed!" | tee -a $LOGS_FILE
    echo "⏱️  Actual duration: ${ACTUAL_DURATION} seconds" | tee -a $LOGS_FILE
    echo "📨 Total messages sent: $TOTAL_MESSAGES" | tee -a $LOGS_FILE
    if [ $ACTUAL_DURATION -gt 0 ]; then
        local AVG_MSGS_PER_SEC=$(echo "scale=2; $TOTAL_MESSAGES / $ACTUAL_DURATION" | bc -l 2>/dev/null || echo "0")
        local AVG_MSGS_PER_CONVERSATION=$(echo "scale=2; $TOTAL_MESSAGES / $TOTAL_CONVOS" | bc -l 2>/dev/null || echo "0")
        echo "📊 Average messages per second: $AVG_MSGS_PER_SEC" | tee -a $LOGS_FILE
        echo "📊 Average messages per conversation: $AVG_MSGS_PER_CONVERSATION" | tee -a $LOGS_FILE
    fi
    
    # Create JSON results
    local MSGS_PER_SEC=0
    if [ $ACTUAL_DURATION -gt 0 ]; then
        MSGS_PER_SEC=$(echo "scale=2; $TOTAL_MESSAGES / $ACTUAL_DURATION" | bc -l 2>/dev/null || echo "0")
    fi
    
    # Use the already defined ACTUAL_GROUPS and ACTUAL_DMS variables
    
    cat > $RESULTS_FILE << EOF
{
  "testId": "$TEST_ID",
  "status": "completed",
  "startTime": "$START_TIME_ISO",
  "endTime": "$END_TIME_ISO", 
  "duration": $ACTUAL_DURATION,
  "totalMessages": $TOTAL_MESSAGES,
  "messagesPerSecond": $MSGS_PER_SEC,
  "groups": $ACTUAL_GROUPS,
  "dms": $ACTUAL_DMS,
  "totalConversations": $TOTAL_CONVOS,
  "messagesPerConversationPerBatch": $MESSAGES_PER_GROUP_PER_BATCH,
  "interval": $INTERVAL,
  "network": "$NETWORK",
  "inboxId": "$INBOX_ID",
  "groupSize": $GROUP_SIZE,
  "stateFile": "$STATE_FILE"
}
EOF
    
    echo "💾 Results written to: $RESULTS_FILE" | tee -a $LOGS_FILE
    echo "📄 Logs written to: $LOGS_FILE" | tee -a $LOGS_FILE
    echo "🗂️  State saved in: $STATE_FILE" | tee -a $LOGS_FILE
    
    # Update final state
    update_state
    
    # Cleanup background processes
    if [ ! -z "${TIMEOUT_PID:-}" ]; then
        kill $TIMEOUT_PID 2>/dev/null || true
    fi
    
    echo "✅ Cleanup complete" | tee -a $LOGS_FILE
    exit 0
}

# Set up timeout with better process handling
echo "⏲️  Setting up timeout for ${DURATION} seconds" | tee -a $LOGS_FILE
(sleep $DURATION && timeout_handler) &
TIMEOUT_PID=$!

# Trap Ctrl+C and other termination signals
trap 'echo "🛑 Received termination signal" | tee -a $LOGS_FILE; KEEP_RUNNING=false; cleanup_and_exit' INT TERM EXIT

# Main load test loop
echo "----------------------------------------" | tee -a $LOGS_FILE
echo "🔥 Starting load test for up to $DURATION seconds..." | tee -a $LOGS_FILE
echo "📬 Sending $MESSAGES_PER_GROUP_PER_BATCH messages to each of $TOTAL_CONVOS conversations every ${INTERVAL}s" | tee -a $LOGS_FILE
echo "   ($ACTUAL_GROUPS groups + $ACTUAL_DMS DMs)" | tee -a $LOGS_FILE

# Initialize counters
LOOP_COUNT=0
TOTAL_MESSAGES=0

# Run until timeout or stopped
while [ "$KEEP_RUNNING" = true ]; do
    LOOP_COUNT=$((LOOP_COUNT + 1))
    
    echo "📤 Batch $LOOP_COUNT: Sending messages..." | tee -a $LOGS_FILE
    
    # Send messages to all conversations
    send_messages_to_all_conversations
    
    # Update total message count (messages go to all conversations)
    MESSAGES_THIS_BATCH=$((TOTAL_CONVOS * MESSAGES_PER_GROUP_PER_BATCH))
    TOTAL_MESSAGES=$((TOTAL_MESSAGES + MESSAGES_THIS_BATCH))
    
    echo "📊 Batch $LOOP_COUNT complete - sent $MESSAGES_THIS_BATCH messages (Total: $TOTAL_MESSAGES)" | tee -a $LOGS_FILE
    
    # Check if we should stop before the sleep
    if [ "$KEEP_RUNNING" != true ]; then
        break
    fi
    
    # Additional safety check: ensure we don't run past the duration
    CURRENT_ELAPSED=$(($(date +%s) - START_TIME))
    if [ $CURRENT_ELAPSED -ge $DURATION ]; then
        echo "⏰ Duration limit reached (${CURRENT_ELAPSED}s >= ${DURATION}s), stopping..." | tee -a $LOGS_FILE
        KEEP_RUNNING=false
        break
    fi
    
    # Progress update every 5 loops
    if [ $((LOOP_COUNT % 5)) -eq 0 ]; then
        ELAPSED=$(($(date +%s) - START_TIME))
        REMAINING=$((DURATION - ELAPSED))
        echo "📈 Progress: ${ELAPSED}s elapsed (${REMAINING}s remaining), sent $TOTAL_MESSAGES messages total (${LOOP_COUNT} batches)" | tee -a $LOGS_FILE
    fi
    
    # Sleep for the specified interval before next batch
    for sleep_counter in $(seq 1 $INTERVAL); do
        if [ "$KEEP_RUNNING" != true ]; then
            break 2
        fi
        sleep 1
    done
done

# If we exited the loop normally due to timeout, run cleanup
echo "🏁 Main loop completed, running cleanup..." | tee -a $LOGS_FILE
cleanup_and_exit