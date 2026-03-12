#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Naukri Bot launcher
#  Usage:
#    ./bot.sh quick 15    → find jobs, run for 15 minutes
#    ./bot.sh quick 30    → find jobs, run for 30 minutes
#    ./bot.sh live        → run all day (10am-3pm loop)
#    ./bot.sh report      → send today's report to Telegram
#    ./bot.sh status      → print today's stats
#    ./bot.sh reset       → clear today's queue (keep seen history)
# ─────────────────────────────────────────────────────────────

MODE=${1:-quick}
MINUTES=${2:-15}

# Check node is available
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install it first."
  exit 1
fi

# Check .env exists
if [ ! -f ".env" ]; then
  echo "❌ .env file not found. Create it with TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID"
  exit 1
fi

# Create data folder if missing
mkdir -p data

case "$MODE" in
  quick)
    echo "⚡ Starting Quick mode — ${MINUTES} minutes"
    node index.js --mode=quick --minutes=$MINUTES
    ;;
  live)
    echo "🔄 Starting Live mode — runs until 3 PM"
    node index.js --mode=live
    ;;
  report)
    echo "📊 Sending daily report..."
    node index.js --mode=report
    ;;
  status)
    echo "📈 Today's status:"
    node index.js --mode=status
    ;;
  reset)
    echo "🔄 Resetting today's queue..."
    node -e "
      import('./src/db/client.js').then(({ default: db }) => {
        db.prepare(\"UPDATE jobs SET status='queued' WHERE DATE(found_at) = DATE('now','localtime')\").run();
        console.log('✅ Queue reset for today');
      });
    "
    ;;
  *)
    echo "❌ Unknown command: $MODE"
    echo ""
    echo "Usage:"
    echo "  ./bot.sh quick 15   → run for 15 minutes"
    echo "  ./bot.sh quick 30   → run for 30 minutes"
    echo "  ./bot.sh live       → run all day"
    echo "  ./bot.sh report     → send daily report"
    echo "  ./bot.sh status     → print stats"
    echo "  ./bot.sh reset      → reset today's queue"
    exit 1
    ;;
esac