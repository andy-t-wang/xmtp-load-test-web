#!/bin/bash
# Enhanced load test script with DM support and state persistence
# USAGE: ./enhanced_load_test.sh <INBOX_ID> [NETWORK] [INTERVAL] [DURATION] [NUM_GROUPS] [MESSAGES_PER_BATCH] [TEST_ID] [NUM_DMS] [USE_EXISTING]

set -eou pipefail

if ! jq --version &>/dev/null; then echo "must install jq"; fi

if [ $# -lt 1 ]; then
    echo "Error: INBOX_ID is required"
    echo "Usage: $0 <INBOX_ID> [NETWORK] [INTERVAL] [DURATION] [NUM_GROUPS] [MESSAGES_PER_BATCH] [TEST_ID] [NUM_DMS] [USE_EXISTING]"
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
USE_EXISTING=${9-false}  # Whether to reuse existing conversations

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
echo "Groups: $NUM_GROUPS" | tee -a $LOGS_FILE
echo "DMs: $NUM_DMS" | tee -a $LOGS_FILE
echo "Use existing conversations: $USE_EXISTING" | tee -a $LOGS_FILE
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

# Check if we should use existing conversations
EXISTING_CONVERSATIONS=""
EXISTING_COUNT=0

if [ "$USE_EXISTING" = "true" ] && load_state; then
    EXISTING_CONVERSATIONS=$(get_existing_conversations)
    EXISTING_COUNT=$(get_conversation_count)
    
    if [ $EXISTING_COUNT -gt 0 ]; then
        echo "🔄 Found $EXISTING_COUNT existing conversations:" | tee -a $LOGS_FILE
        echo "$EXISTING_CONVERSATIONS" | head -10 | while read -r conv_id; do
            [ -n "$conv_id" ] && echo "  - $conv_id" | tee -a $LOGS_FILE
        done
        if [ $EXISTING_COUNT -gt 10 ]; then
            echo "  ... and $((EXISTING_COUNT - 10)) more" | tee -a $LOGS_FILE
        fi
    else
        echo "⚠️  No valid conversations found in existing state, creating new ones" | tee -a $LOGS_FILE
        USE_EXISTING=false
    fi
else
    echo "🏗️  Creating new conversations" | tee -a $LOGS_FILE
    USE_EXISTING=false
fi

# Initialize or reset state if not using existing
if [ "$USE_EXISTING" != "true" ]; then
    initialize_state
    
    # Clear and initialize (xdbg already built in previous step)
    echo "🔧 Initializing xdbg..." | tee -a $LOGS_FILE
    ${XDBG_PATH:-./target/release/xdbg} --clear 2>&1 | tee -a $LOGS_FILE
    $CMD --clear 2>&1 | tee -a $LOGS_FILE

    # Generate identities for group members (more than needed to ensure variety)
    TOTAL_CONVERSATIONS=$((NUM_GROUPS + NUM_DMS))
    IDENTITIES_NEEDED=$((TOTAL_CONVERSATIONS * 10 + 10))  # Extra identities for variety
    echo "🆔 Generating $IDENTITIES_NEEDED identities..." | tee -a $LOGS_FILE
    $CMD generate --entity identity --amount $IDENTITIES_NEEDED 2>&1 | tee -a $LOGS_FILE

    # Create group conversations (larger groups)
    if [ $NUM_GROUPS -gt 0 ]; then
        echo "👥 Creating $NUM_GROUPS group conversations (will have 10+ members each after adding target)..." | tee -a $LOGS_FILE
        for i in $(seq 1 $NUM_GROUPS); do
            echo "  Creating group $i/$NUM_GROUPS (9 initial members, target will be added later)" | tee -a $LOGS_FILE
            GROUP_OUTPUT=$($CMD generate --entity group --amount 1 --invite 9 2>&1 | tee -a $LOGS_FILE)
            
            # Extract group ID from output (xdbg should output the created group ID)
            # This is a simplified approach - in practice we'd need to parse xdbg output properly
        done
    fi

    # Create DM conversations (2-person groups: creator + target inbox only)
    if [ $NUM_DMS -gt 0 ]; then
        echo "💬 Creating $NUM_DMS DM conversations (2 members each)..." | tee -a $LOGS_FILE
        for i in $(seq 1 $NUM_DMS); do
            echo "  Creating DM $i/$NUM_DMS (creator only, target will be added later)" | tee -a $LOGS_FILE
            DM_OUTPUT=$($CMD generate --entity group --amount 1 --invite 0 2>&1 | tee -a $LOGS_FILE)
        done
    fi

    # Export and save all conversations to state
    EXPORT=$(mktemp)
    echo "📋 Exporting conversations to state..." | tee -a $LOGS_FILE
    $CMD export --entity group --out $EXPORT 2>&1 | tee -a $LOGS_FILE

    # Process exported groups and save to state
    TOTAL_CONVOS=$((NUM_GROUPS + NUM_DMS))
    ALL_GROUP_IDS=($(jq -r '.[].id' $EXPORT | head -$TOTAL_CONVOS))

    # Save groups to state (first NUM_GROUPS are regular groups)
    for i in $(seq 0 $((NUM_GROUPS - 1))); do
        if [ $i -lt ${#ALL_GROUP_IDS[@]} ]; then
            group_id="${ALL_GROUP_IDS[$i]}"
            save_conversation "$group_id" "group" 10  # 9 invited + 1 creator + 1 target = 11, but calling it 10 for simplicity
        fi
    done

    # Save DMs to state (remaining are DMs)
    for i in $(seq $NUM_GROUPS $((TOTAL_CONVOS - 1))); do
        if [ $i -lt ${#ALL_GROUP_IDS[@]} ]; then
            dm_id="${ALL_GROUP_IDS[$i]}"
            save_conversation "$dm_id" "dm" 2  # 1 creator + 1 target = 2 members total
        fi
    done

    # Add the specified inbox to all conversations
    # This will make DMs have exactly 2 members (creator + target)
    # and groups have 10+ members (creator + invited + target)
    echo "➕ Adding inbox $INBOX_ID to all conversations..." | tee -a $LOGS_FILE
    
    # Add to groups
    for i in $(seq 0 $((NUM_GROUPS - 1))); do
        if [ $i -lt ${#ALL_GROUP_IDS[@]} ]; then
            group_id="${ALL_GROUP_IDS[$i]}"
            echo "  Adding to group $((i+1))/$NUM_GROUPS (ID: ${group_id:0:8}...)" | tee -a $LOGS_FILE
            $CMD modify --inbox-id $INBOX_ID add-external "$group_id" 2>&1 | tee -a $LOGS_FILE || echo "  ⚠️  Failed to add to group" | tee -a $LOGS_FILE
        fi
    done

    # Add to DMs
    for i in $(seq $NUM_GROUPS $((TOTAL_CONVOS - 1))); do
        if [ $i -lt ${#ALL_GROUP_IDS[@]} ]; then
            dm_id="${ALL_GROUP_IDS[$i]}"
            dm_num=$((i - NUM_GROUPS + 1))
            echo "  Adding to DM $dm_num/$NUM_DMS (ID: ${dm_id:0:8}...)" | tee -a $LOGS_FILE
            $CMD modify --inbox-id $INBOX_ID add-external "$dm_id" 2>&1 | tee -a $LOGS_FILE || echo "  ⚠️  Failed to add to DM" | tee -a $LOGS_FILE
        fi
    done

    rm -f $EXPORT
    update_state
else
    # Using existing conversations - just get the IDs
    ALL_GROUP_IDS=($(get_existing_conversations | head -50))  # Limit to reasonable number
fi

TOTAL_CONVOS=${#ALL_GROUP_IDS[@]}
echo "✅ Using $TOTAL_CONVOS conversations for load testing" | tee -a $LOGS_FILE

if [ $TOTAL_CONVOS -eq 0 ]; then
    echo "❌ No conversations available for testing" | tee -a $LOGS_FILE
    exit 1
fi

# Count conversation types from state for display
ACTUAL_GROUPS=0
ACTUAL_DMS=0
if [ -f "$STATE_FILE" ]; then
    ACTUAL_GROUPS=$(jq '[.conversations[] | select(.type == "group")] | length' "$STATE_FILE" 2>/dev/null || echo "0")
    ACTUAL_DMS=$(jq '[.conversations[] | select(.type == "dm")] | length' "$STATE_FILE" 2>/dev/null || echo "0")
else
    ACTUAL_GROUPS=$NUM_GROUPS
    ACTUAL_DMS=$NUM_DMS
fi

# Function to send messages to all conversations
send_messages_to_all_conversations() {
    # Send messages to all conversations (no need to specify group ID)
    # Each call sends 1 message to all conversations
    # Must be sequential - xdbg can't handle parallel database access
    for msg_num in $(seq 1 $MESSAGES_PER_GROUP_PER_BATCH); do
        $CMD generate --entity message --amount 1 2>&1 | tee -a $LOGS_FILE
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
  "usedExisting": $([ "$USE_EXISTING" = "true" ] && echo "true" || echo "false"),
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