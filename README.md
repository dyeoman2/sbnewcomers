# sbnewcomers

Repository for all projects by SB Newcomers Technology committee members

## Prerequisites

- You \***\*_must_\*\*** have Administrator rights on WildApricot. Contact the Technology Committee ([:email:](mailto:technology@sbnewcomers.org)) for assistance.
- Recipient e-mail address for reporting (e.g., technology@sbnewcomers.org) \***\*_must_\*\*** be verified in the Amazon Simple E-mail Service (SES) console ([HOWTO](https://docs.aws.amazon.com/ses/latest/DeveloperGuide/verify-email-addresses-procedure.html)).

## Script

- [Member Updates](./memberUpdates) - A Node.js script that uses the WildApricot API to execute a daily query of members who have been active in the club for more than 90 day and change their membership level from "Newbie" to "Regular". It also finds any members in WildApricot that have passed their renewal date and changes their membership level to "Alumni"

## Scheduled Execution

The CRON job runs every day at 10am UTC by the [Daily CRON Github Action](.github/workflows/daily-cron-job.yaml). The Github Action sends a get request to the /memberUpdates endpoint defined in app.js. To see the CRON job history, go to the [Github Action](https://github.com/dyeoman2/sbnewcomers/actions/workflows/daily-cron-job.yaml)

## Start Coding

1. Copy the file `.env_sample` to `.env`

2. Update the `.env` file using the data shown the in AWS Login Info file in the shared shared Google Drive TECH folder. The actual .env file used by the application is in S3.

   ```ini
   AWS_ACCESS_KEY_ID=<your_aws_acccess_key_id>
   AWS_SECRET_ACCESS_KEY=<your_aws_acccess_key_secret>
   AWS_REGION=us-east-2
   WILDAPRICOT_USER_ID=<your_sbnc_user_id>
   WILDAPRICOT_PASSWORD=<your_sbnc_password>
   WILDAPRICOT_CLIENT_ID=<sbniapi_client_id>
   WILDAPRICOT_CLIENT_SECRET=<sbniapi_client_secret>
   WILDAPRICOT_ACCOUNT_ID=176353
   WILDAPRICOT_SCOPE=auto
   ```

   The values for `WILDAPRICOT_CLIENT_ID` and `WILDAPRICOT_CLIENT_SECRET` can be obtained from the SBNCAPI authorized application (see the **Settings >> Security >> Authorized applications** option on WildApricot). If the SBNCAPI application is ever deleted, a new authorized application can be created in its place ([HOWTO](https://gethelp.wildapricot.com/en/articles/180-authorizing-external-applications)).

   The values for `WILDAPRICOT_ACCOUNT_ID` and `WILDAPRICOT_SCOPE` should not change.

   If you need more assistance, contact the Technology Committee ([:email:](mailto:technology@sbnewcomers.org)).

3. Run the application locally using NPM or Docker

   Start locally

   ```
   npm install
   npm start
   ```

   Start in Docker

   ```
   docker-compose up -d --build
   ```

   Stop in Docker

   ```
   docker-compose down -v
   ```

4. When you push your changes to the main branch, they are automatically deployed to the AWS ECS cluster via the [AWS Deploy Github Action](.github/workflows/aws-deploy.yml). Deployment take ~5 minutes and the progress can be tracked in the repo's [Github Actions](https://github.com/dyeoman2/sbnewcomers/actions/workflows/aws-deploy.yml) or in AWS.

If you need to add or update environment vairables in the live application, you will need to update your .env locally, download the [AWS Copilot CLI](https://aws.github.io/copilot-cli/), and run `copilot deploy`. The AWS container infrastructure was setup using the AWS Copilot CLI and it is the easiest way to make updates to the application's infrastructure. The infrastructure code is located in the [copilot folder](./copilot).

## WildApricot API limits

Be mindful of the [WildApricot API limits](https://gethelp.wildapricot.com/en/articles/182#limits) which permit up to 60 calls per minute. Each individual script already takes that into account, but executing two or more scripts on an overlapping schedule will exceed the limits and result in API errors.
