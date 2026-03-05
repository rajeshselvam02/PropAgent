# PropAgent Cron Job Configuration
#
# Add this to your crontab:
# crontab -e
#
# Run deployment every hour (or on reboot)
# 0 * * * * /root/.openclaw/workspace/PropAgent/scripts/cron-deploy.sh
#
# Or run once and capture results:
# @reboot /root/.openclaw/workspace/PropAgent/scripts/cron-deploy.sh && /root/.openclaw/workspace/PropAgent/scripts/start-services.sh

# For immediate execution, run:
# ./scripts/cron-deploy.sh
# ./scripts/start-services.sh
