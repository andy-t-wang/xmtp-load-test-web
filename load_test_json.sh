#!/bin/bash
# Enhanced load test script that outputs JSON results
# USAGE: ./load_test_json.sh <INBOX_ID> [NETWORK] [INTERVAL] [DURATION] [NUM_GROUPS] [MESSAGES_PER_BATCH] [TEST_ID]

set -eou pipefail

if ! jq --version &>/dev/null; then echo "must install jq"; fi

if [ $# -lt 1 ]; then
    echo "Error: INBOX_ID is required"
    echo "Usage: $0 <INBOX_ID> [NETWORK] [INTERVAL] [DURATION] [NUM_GROUPS] [MESSAGES_PER_BATCH] [TEST_ID]"
    exit 1
fi

INBOX_ID=$1
NETWORK=${2-"dev"}
INTERVAL=${3-1}
DURATION=${4-30}
NUM_GROUPS=${5-10}
MESSAGES_PER_GROUP_PER_BATCH=${6-3}
TEST_ID=${7-"test_$(date +%s)"}
NUM_DMS=${8-0}  # Number of DM conversations (2-person groups)

CMD="${XDBG_PATH:-./target/release/xdbg} -b $NETWORK"

# Output files
RESULTS_FILE="results_${TEST_ID}.json"
LOGS_FILE="logs_${TEST_ID}.txt"

echo "Starting XMTP Load Test" | tee $LOGS_FILE
echo "Test ID: $TEST_ID" | tee -a $LOGS_FILE
echo "Inbox ID: $INBOX_ID" | tee -a $LOGS_FILE
echo "Network: $NETWORK" | tee -a $LOGS_FILE
echo "Duration: ${DURATION}s" | tee -a $LOGS_FILE
echo "Interval between batches: ${INTERVAL}s" | tee -a $LOGS_FILE
echo "Groups: $NUM_GROUPS" | tee -a $LOGS_FILE
echo "DMs: $NUM_DMS" | tee -a $LOGS_FILE
echo "Messages per group per batch: $MESSAGES_PER_GROUP_PER_BATCH" | tee -a $LOGS_FILE
echo "----------------------------------------" | tee -a $LOGS_FILE

# Record start time
START_TIME=$(date +%s)
START_TIME_ISO=$(date -Iseconds)

# Clear and initialize (xdbg already built in previous step)
echo "Initializing..." | tee -a $LOGS_FILE
${XDBG_PATH:-./target/release/xdbg} --clear 2>&1 | tee -a $LOGS_FILE
$CMD --clear 2>&1 | tee -a $LOGS_FILE

# Generate identities for group members
echo "Generating identities..." | tee -a $LOGS_FILE
$CMD generate --entity identity --amount 20 2>&1 | tee -a $LOGS_FILE

# Create groups (multi-member)
if [ $NUM_GROUPS -gt 0 ]; then
    echo "Creating $NUM_GROUPS groups (10 members each)..." | tee -a $LOGS_FILE
    for i in $(seq 1 $NUM_GROUPS); do
        echo "  Creating group $i/$NUM_GROUPS" | tee -a $LOGS_FILE
        $CMD generate --entity group --amount 1 --invite 10 2>&1 | tee -a $LOGS_FILE
    done
fi

# Create DMs (2-member groups)
if [ $NUM_DMS -gt 0 ]; then
    echo "Creating $NUM_DMS DMs (2 members each)..." | tee -a $LOGS_FILE
    for i in $(seq 1 $NUM_DMS); do
        echo "  Creating DM $i/$NUM_DMS" | tee -a $LOGS_FILE
        $CMD generate --entity group --amount 1 --invite 1 2>&1 | tee -a $LOGS_FILE
    done
fi

# Get group IDs
EXPORT=$(mktemp)
echo "Exporting groups to $EXPORT" | tee -a $LOGS_FILE
$CMD export --entity group --out $EXPORT 2>&1 | tee -a $LOGS_FILE

# Display created conversations
TOTAL_CONVOS=$((NUM_GROUPS + NUM_DMS))
echo "Created $TOTAL_CONVOS conversations:" | tee -a $LOGS_FILE
jq -r '.[].id' $EXPORT | head -$TOTAL_CONVOS | tee -a $LOGS_FILE

# Add the specified inbox to all groups and DMs
echo "Adding inbox $INBOX_ID to all conversations..." | tee -a $LOGS_FILE
ALL_GROUP_IDS=($(jq -r '.[].id' $EXPORT | head -$TOTAL_CONVOS))

# Add to multi-member groups
for i in $(seq 0 $((NUM_GROUPS - 1))); do
    if [ $i -lt ${#ALL_GROUP_IDS[@]} ]; then
        group_id="${ALL_GROUP_IDS[$i]}"
        echo "  Adding to group $((i+1))/$NUM_GROUPS (ID: $group_id)" | tee -a $LOGS_FILE
        $CMD modify --inbox-id $INBOX_ID add-external "$group_id" 2>&1 | tee -a $LOGS_FILE
    fi
done

# Add to DMs
for i in $(seq $NUM_GROUPS $((TOTAL_CONVOS - 1))); do
    if [ $i -lt ${#ALL_GROUP_IDS[@]} ]; then
        dm_id="${ALL_GROUP_IDS[$i]}"
        dm_num=$((i - NUM_GROUPS + 1))
        echo "  Adding to DM $dm_num/$NUM_DMS (ID: $dm_id)" | tee -a $LOGS_FILE
        $CMD modify --inbox-id $INBOX_ID add-external "$dm_id" 2>&1 | tee -a $LOGS_FILE
    fi
done

# Function to send messages to all groups
send_messages_to_all_groups() {
    # Send messages to all groups (no need to specify group ID)
    # Each call sends 1 message to all groups
    # Must be sequential - xdbg can't handle parallel database access
    for msg_num in $(seq 1 $MESSAGES_PER_GROUP_PER_BATCH); do
        $CMD generate --entity message --amount 1 2>&1 | tee -a $LOGS_FILE
    done
}

# Global variable to track if we should continue running
KEEP_RUNNING=true

# Trap for timeout
timeout_handler() {
    echo "Test duration reached, stopping..." | tee -a $LOGS_FILE
    KEEP_RUNNING=false
}

# Function to handle cleanup and exit
cleanup_and_exit() {
    local END_TIME=$(date +%s)
    local END_TIME_ISO=$(date -Iseconds)
    local ACTUAL_DURATION=$((END_TIME - START_TIME))
    
    echo "----------------------------------------" | tee -a $LOGS_FILE
    echo "Load test completed!" | tee -a $LOGS_FILE
    echo "Actual duration: ${ACTUAL_DURATION} seconds" | tee -a $LOGS_FILE
    echo "Total messages sent: $TOTAL_MESSAGES" | tee -a $LOGS_FILE
    if [ $ACTUAL_DURATION -gt 0 ]; then
        local AVG_MSGS_PER_SEC=$((TOTAL_MESSAGES / ACTUAL_DURATION))
        local AVG_MSGS_PER_GROUP=$((TOTAL_MESSAGES / NUM_GROUPS))
        echo "Average messages per second: $AVG_MSGS_PER_SEC" | tee -a $LOGS_FILE
        echo "Average messages per group: $AVG_MSGS_PER_GROUP" | tee -a $LOGS_FILE
    fi
    
    # Create JSON results
    local MSGS_PER_SEC=0
    if [ $ACTUAL_DURATION -gt 0 ]; then
        MSGS_PER_SEC=$(echo "scale=2; $TOTAL_MESSAGES / $ACTUAL_DURATION" | bc -l 2>/dev/null || echo "0")
    fi
    
    cat > $RESULTS_FILE << EOF
{
  "testId": "$TEST_ID",
  "status": "completed",
  "startTime": "$START_TIME_ISO",
  "endTime": "$END_TIME_ISO", 
  "duration": $ACTUAL_DURATION,
  "totalMessages": $TOTAL_MESSAGES,
  "messagesPerSecond": $MSGS_PER_SEC,
  "groups": $NUM_GROUPS,
  "dms": $NUM_DMS,
  "totalConversations": $TOTAL_CONVOS,
  "messagesPerGroupPerBatch": $MESSAGES_PER_GROUP_PER_BATCH,
  "interval": $INTERVAL,
  "network": "$NETWORK",
  "inboxId": "$INBOX_ID"
}
EOF
    
    echo "Results written to: $RESULTS_FILE" | tee -a $LOGS_FILE
    echo "Logs written to: $LOGS_FILE" | tee -a $LOGS_FILE
    
    # Cleanup background processes
    if [ ! -z "${TIMEOUT_PID:-}" ]; then
        kill $TIMEOUT_PID 2>/dev/null || true
    fi
    
    rm -f $EXPORT
    echo "Cleanup complete" | tee -a $LOGS_FILE
    
    exit 0
}

# Set up timeout with better process handling
echo "Setting up timeout for ${DURATION} seconds (PID will be stored)" | tee -a $LOGS_FILE
(sleep $DURATION && timeout_handler) &
TIMEOUT_PID=$!
echo "Timeout process started with PID: $TIMEOUT_PID" | tee -a $LOGS_FILE

# Trap Ctrl+C and other termination signals
trap 'echo "Received termination signal" | tee -a $LOGS_FILE; KEEP_RUNNING=false; cleanup_and_exit' INT TERM EXIT

# Main load test loop
echo "----------------------------------------" | tee -a $LOGS_FILE
echo "Starting load test for up to $DURATION seconds..." | tee -a $LOGS_FILE
echo "Sending $MESSAGES_PER_GROUP_PER_BATCH messages to each of $TOTAL_CONVOS conversations every ${INTERVAL}s" | tee -a $LOGS_FILE
echo "  ($NUM_GROUPS groups + $NUM_DMS DMs)" | tee -a $LOGS_FILE

LOOP_COUNT=0
TOTAL_MESSAGES=0

# Run until timeout or stopped
while [ "$KEEP_RUNNING" = true ]; do
    LOOP_COUNT=$((LOOP_COUNT + 1))
    
    echo "Batch $LOOP_COUNT: Sending messages..." | tee -a $LOGS_FILE
    
    # Send messages to all groups
    send_messages_to_all_groups
    
    # Update total message count (messages go to all groups and DMs)
    MESSAGES_THIS_BATCH=$((TOTAL_CONVOS * MESSAGES_PER_GROUP_PER_BATCH))
    TOTAL_MESSAGES=$((TOTAL_MESSAGES + MESSAGES_THIS_BATCH))
    
    # Check if we should stop before the sleep
    if [ "$KEEP_RUNNING" != true ]; then
        break
    fi
    
    # Additional safety check: ensure we don't run past the duration even if timeout handler fails
    CURRENT_ELAPSED=$(($(date +%s) - START_TIME))
    if [ $CURRENT_ELAPSED -ge $DURATION ]; then
        echo "Duration limit reached (${CURRENT_ELAPSED}s >= ${DURATION}s), stopping..." | tee -a $LOGS_FILE
        KEEP_RUNNING=false
        break
    fi
    
    # Progress update every 5 loops, and also show remaining time
    if [ $((LOOP_COUNT % 5)) -eq 0 ]; then
        ELAPSED=$(($(date +%s) - START_TIME))
        REMAINING=$((DURATION - ELAPSED))
        echo "Progress: ${ELAPSED}s elapsed (${REMAINING}s remaining), sent $TOTAL_MESSAGES messages total (${LOOP_COUNT} batches)" | tee -a $LOGS_FILE
    fi
    
    # Sleep for the specified interval before next batch, but check periodically if we should stop
    for sleep_counter in $(seq 1 $INTERVAL); do
        if [ "$KEEP_RUNNING" != true ]; then
            break 2  # Break out of both sleep loop and main loop
        fi
        sleep 1
    done
done

# If we exited the loop normally due to timeout, run cleanup
echo "Main loop completed, running cleanup..." | tee -a $LOGS_FILE
cleanup_and_exit