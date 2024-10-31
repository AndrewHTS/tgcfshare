# Telegram File Share Bot

This project is a Telegram bot designed for file uploads, batch management, and automatic status checks for channel memberships. It allows users to upload files into batches and retrieve them easily. The bot also checks if users are part of a specified channel before permitting file uploads.

## Features

- **Batch Creation**: Users can create batches to group their file uploads.
- **File Uploads**: Users can Share various file types (documents, photos, audio, video) to their active batch.
- **Batch Listing**: Users can view all batches they have created.
- **File Retrieval**: Users can retrieve files from a specific batch.
- **Channel Membership Check**: Ensures users are members of a specific channel before file uploads.

## Database Structure

The bot uses two tables in a D1 SQL database:

### 1. Files Table

```sql
CREATE TABLE files (
  file_id TEXT PRIMARY KEY,
  file_unique_id TEXT UNIQUE NOT NULL, 
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  chat_id INTEGER,
  type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Batches Table

```sql
CREATE TABLE batches (
  batch_id TEXT PRIMARY KEY,
  user_id INTEGER,
  file_count INTEGER DEFAULT 0,
  file_unique_ids TEXT
);
```

## Getting Started

### Prerequisites

- A Telegram Bot Token: Create a new bot via [BotFather](https://t.me/botfather) on Telegram.
- Cloudflare account with Workers enabled.
- A D1 SQL database on Cloudflare.

### Step 1: Setting Up Your Cloudflare Worker

1. **Log in to Cloudflare**:

   Go to [dash.cloudflare.com](https://dash.cloudflare.com) and log in to your account.

2. **Create a New Worker**:

   - Navigate to the **Workers** section in the left sidebar.
   - Click on **Create a Service**.
   - Choose **Quick Edit** to create a new worker.

3. **Configure Your Worker**:

   Replace the default code in the worker editor with your bot's logic. From [worker.js](worker.js) file

4. **Binding D1 SQL Database**:

   - In the **Settings** tab of your worker, find the **Bindings** section.
   - Click on **Add binding** and select **Database**.
   - Set the name as `DSQL` and choose your D1 database from the dropdown menu.

5. **Set Environment Variables**:

   In the **Settings** tab, scroll to **Variables** and add the required environment variables:

   - `BOT_TOKEN`: Your Telegram bot token.
   - `MAIN_CHANNEL_ID`: Your channel ID.
   - `BOT_USERNAME`: (Optional) Your bot's username.

   Example:

   | Name          | Value                        |
   |---------------|------------------------------|
   | BOT_TOKEN     |  your-telegram-bot-token     |
   | MAIN_CHANNEL_ID |  @channelusername          |
   | BOT_USERNAME  |  your-bot-username           |

### Step 2: Deploying Your Bot

1. **Save and Deploy**:

   - Click the **Save and Deploy** button at the top right corner to publish your Cloudflare Worker.

### Step 3: Setting Up the Webhook

To receive updates from Telegram, you need to set up a webhook.

1. **Set Webhook URL**:

   Run the following command in your terminal or a tool like Postman to set the webhook for your bot:

   ```bash
   curl -X POST "https://api.telegram.org/bot<your-telegram-bot-token>/setWebhook?url=<your-worker-url>/webhook"
   ```

   Replace `<your-telegram-bot-token>` with your bot token and `<your-worker-url>` with the URL of your Cloudflare Worker.

2. **Verify the Webhook**:

   You can check the status of your webhook by running:

   ```bash
   curl "https://api.telegram.org/bot<your-telegram-bot-token>/getWebhookInfo"
   ```

   This command will return details about the webhook, including the current status and any recent errors.

### Step 4: Adding the Bot to Your Channel

1. **Add Bot to Channel**:

   Make sure to add your bot to your Telegram channel as an administrator. This allows it to perform the necessary checks and respond to user requests.

2. **Check Membership**:

   The bot will check if the user is a member of the specified channel before allowing them to Share files. This is handled in the `isUserInMainChannel` function.

## Commands

- `/start`: Starts the bot and provides a welcome message with command options.
- `/batch`: Creates a new batch for file uploads.
- `/showbatches`: Lists all batch IDs associated with the user.

## Error Handling

- Users will receive a message if they attempt to Share files without being a member of the specified channel.
- The bot will inform users if they try to Share a file that has already been uploaded.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.
