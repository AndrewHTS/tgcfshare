export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/webhook') {
      return await handleWebhook(request, env);
    } else {
      return await handleRequest(request);
    }
  }
}

// Basic response for non-webhook requests
async function handleRequest(request) {
  return new Response('ok', {
    headers: {
      'Content-Type': 'text/html'
    },
    status: 200
  });
}

// Handle incoming webhook events from Telegram
async function handleWebhook(request, env) {
  const update = await request.json();
  const { message } = update;

  if (message) {
    const {
      message_id,
      chat,
      text,
      photo,
      video,
      document,
      audio
    } = message;

    const chatId = chat.id;

    // Check if the user is a member of the main channel
    const isMember = await isUserInMainChannel(chatId, env);
    if (!isMember) {
      return new Response(
        JSON.stringify({
          method: "sendMessage",
          chat_id: chatId,
          text: "You need to join our @Nexiuo to use this bot.",
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=UTF-8'
          }
        }
      );
    }

    // Handle different commands or message types as before
    if (text) {
      const commandParts = text.split(' ');
      const command = commandParts[0].toLowerCase();

      if (command === '/start') {
        const startParam = commandParts[1] ? commandParts[1] : null;
        console.info('Start parameter:', startParam);
        return await sendStartMessage(chatId, startParam, env);
      } else if (command === '/batch') {
        return await createBatchInstance(chatId, env);
      } else if (command === '/showbatches') {
        return await showAllBatches(chatId, env);
      } else {
        return sendUnknownCommandMessage(chatId);
      }
    } else if (document || audio || video || photo) {
      return await handleFileUpload(message, chatId, env);
    }
  }

  return new Response('OK', { status: 200 });
}

// New function to check if a user is a member of the main channel
async function isUserInMainChannel(chatId, env) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/getChatMember?chat_id=${env.MAIN_CHANNEL_ID}&user_id=${chatId}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.ok && data.result.status !== 'left' && data.result.status !== 'kicked') {
      return true; // User is a member of the main channel
    }
  } catch (error) {
    console.error('Error checking membership status:', error);
  }

  return false; // User is not a member of the main channel
}

// Function to send a welcome message for the /start command
async function sendStartMessage(chatId, startParam, env) {
  if (startParam) {
    // Assume the start parameter might be a batch ID
    const batchId = startParam;
    
    // Fetch and display files in the batch if batch ID is valid
    return await showFilesInBatch(chatId, batchId, env);
  } else {
    const welcomeText = `Hi there! Welcome to the Bot! 🎉\n\nYou can use the following commands:\n/start - Start the bot\n/batch - Create a batch for file uploads.\n/showbatches - Show All your Batch IDs`;
    
    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: welcomeText,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );
  }
}

// Create a new batch instance for the user
async function createBatchInstance(chatId, env) {
  // Check if there is an existing active batch that is not full
  const existingBatch = await getActiveBatchForUser(chatId, env);

  if (existingBatch) {
    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: "You already have an active batch. Use that to upload files until it's full.",
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );
  }

  // Create a new batch since no active one exists
  try {
    const batchId = await createBatch(chatId, env);
    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: `New batch created with ID: ${batchId}. You can now upload files.`,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );
  } catch (error) {
    console.error('Error creating batch:', error);
    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: "Error creating batch: " + error.message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

// Get active batch for a user
async function getActiveBatchForUser(chatId, env) {
  const sql = `
    SELECT batch_id 
    FROM batches 
    WHERE user_id = ? 
      AND file_count < 20
  `;
  const stmt = env.DSQL.prepare(sql).bind(chatId);  // Bind parameter to prevent SQL injection
  const result = await stmt.first();
  return result ? result.batch_id : null; // Return batch_id if it exists, otherwise null
}

// Create a new batch instance for the user
function generateRandomBatchId(length = 7) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function createBatch(chatId, env, maxRetries = 5) {
  let batchId;
  let retries = 0;
  
  while (retries < maxRetries) {
    batchId = generateRandomBatchId();  // Generate a random batch ID

    // Check if batch_id already exists
    const checkSql = `SELECT COUNT(*) AS count FROM batches WHERE batch_id = ?;`;
    const checkResult = await env.DSQL.prepare(checkSql).bind(batchId).first();

    if (checkResult && checkResult.count === 0) {
      // batch_id is unique, so we can use it
      const sql = `INSERT INTO batches (batch_id, user_id) VALUES (?, ?);`;
      try {
        await env.DSQL.prepare(sql).bind(batchId, chatId).run();
        console.info("Batch created successfully with ID:", batchId);
        return batchId;
      } catch (error) {
        console.error('Error inserting batch:', error);
        throw error;
      }
    }
    
    // If batch ID already exists, increment retry counter
    retries++;
  }

  // If we exceed max retries, throw an error
  throw new Error('Failed to generate a unique batch ID after multiple attempts.');
}

// Function to check if the same file unique ID has already been saved for this user
async function checkFileExists(chatId, fileUniqueId, env) {
  const sql = 'SELECT COUNT(*) AS count FROM files WHERE chat_id = ? AND file_unique_id = ?';
  const stmt = await env.DSQL.prepare(sql).bind(chatId, fileUniqueId);
  const result = await stmt.first();
  return result ? result.count > 0 : false; // Return true if file exists, otherwise false
}

// Handle file uploads
async function handleFileUpload(message, chatId, env) {
  const batchId = await getActiveBatchForUser(chatId, env);
  if (!batchId) {
    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: "You need to create a batch first by using /batch.",
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );
  }

  const fileInfo = extractFileInfo(message);
  
  // Check if the file already exists
  const fileExists = await checkFileExists(chatId, fileInfo.file_unique_id, env);
  if (fileExists) {
    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: "This file has already been uploaded.",
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );
  }

  // Save the file info to D1 SQL
  const saveResult = await saveFileToD1(fileInfo, chatId, env);
  if (saveResult) {
    await addFileToBatch(batchId, fileInfo.file_unique_id, env); // Now passing file_unique_id as well
    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: "File information saved successfully!",
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );
  } else {
    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: "Failed to save file information.",
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

// Function to extract file information from the message
function extractFileInfo(message) {
  let fileInfo;
  const { document, audio, video, photo } = message;

  if (document) {
    fileInfo = {
      file_id: document.file_id,
      file_unique_id: document.file_unique_id,
      file_name: document.file_name,
      mime_type: document.mime_type,
      type: 'document'
    };
  } else if (audio) {
    fileInfo = {
      file_id: audio.file_id,
      file_unique_id: audio.file_unique_id,
      file_name: audio.file_name,
      mime_type: audio.mime_type,
      type: 'audio'
    };
  } else if (video) {
    fileInfo = {
      file_id: video.file_id,
      file_unique_id: video.file_unique_id,
      file_name: video.file_name,
      mime_type: video.mime_type,
      type: 'video'
    };
  } else if (photo) {
    const largestPhoto = photo[photo.length - 1]; // Get the largest size
    fileInfo = {
      file_id: largestPhoto.file_id,
      file_unique_id: largestPhoto.file_unique_id,
      file_name: largestPhoto.file_unique_id + '.jpg',
      mime_type: 'image/jpeg',
      type: 'photo'
    };
  }

  return fileInfo;
}

// Save file information to the D1 database
async function saveFileToD1(fileInfo, chatId, env) {
  const sql = `
    INSERT INTO files (file_id, file_unique_id, file_name, mime_type, chat_id, type)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_unique_id) DO UPDATE SET 
      file_id = excluded.file_id,
      file_name = excluded.file_name,
      mime_type = excluded.mime_type,
      chat_id = excluded.chat_id,
      type = excluded.type;
  `;

  try {
    await env.DSQL.prepare(sql)
      .bind(
        fileInfo.file_id,
        fileInfo.file_unique_id,
        fileInfo.file_name,
        fileInfo.mime_type,
        chatId,
        fileInfo.type
      ).run();

    console.info("File saved successfully:", fileInfo.file_unique_id);
    return true; // Indicate success
  } catch (error) {
    console.error('Error saving file:', error);
    return false; // Indicate failure
  }
}

// Ensure that 'file_count' exists in your batches table if you're updating it
async function addFileToBatch(batchId, fileUniqueId, env) {
  try {
    // Fetch the current file_unique_ids for the batch
    const fetchSql = env.DSQL.prepare("SELECT file_unique_ids FROM batches WHERE batch_id = ?;").bind(batchId);
    const result = await fetchSql.first();
    
    let fileUniqueIds = result.file_unique_ids ? JSON.parse(result.file_unique_ids) : [];
    fileUniqueIds.push(fileUniqueId); // Add the new file_unique_id to the list

    // Update the file count and file_unique_ids
    const updateSql = `
      UPDATE batches 
      SET file_count = file_count + 1, 
          file_unique_ids = ? 
      WHERE batch_id = ?;
    `;
    await env.DSQL.prepare(updateSql).bind(JSON.stringify(fileUniqueIds), batchId).run();

    console.info(`File ${fileUniqueId} added to batch ${batchId}.`);
  } catch (error) {
    console.error('Error adding file to batch:', error);
  }
}

// retrieve file_unique_ids in JSON format and parse it when needed
async function getFilesInBatch(batchId, env) {
  const sql = `SELECT file_unique_ids FROM batches WHERE batch_id = ?;`;
  const stmt = await env.DSQL.prepare(sql).bind(batchId);
  const result = await stmt.first();
  return result ? JSON.parse(result.file_unique_ids) : [];
}

// Send an unknown command message to the user
function sendUnknownCommandMessage(chatId) {
  return new Response(
    JSON.stringify({
      method: "sendMessage",
      chat_id: chatId,
      text: "Unknown command. Please use /start or /batch.",
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8'
      }
    }
  );
}

// Retrieve and display files in a batch
async function showFilesInBatch(chatId, batchId, env) {
  try {
    const sql = `SELECT file_unique_ids FROM batches WHERE batch_id = ?;`;
    const stmt = await env.DSQL.prepare(sql).bind(batchId);
    const result = await stmt.first();

    if (!result || !result.file_unique_ids) {
      return new Response(
        JSON.stringify({
          method: "sendMessage",
          chat_id: chatId,
          text: `No files found in batch ID: ${batchId}.`,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=UTF-8'
          }
        }
      );
    }

    const fileUniqueIds = JSON.parse(result.file_unique_ids);
    const fileDetails = await getFileDetails(fileUniqueIds, env);

    for (const file of fileDetails) {
      await sendFileToUser(chatId, file, env);
    }

    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: `Files from Batch ID: ${batchId} have been sent.`,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );

  } catch (error) {
    console.error('Error retrieving files in batch:', error);
    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: "Error retrieving files in batch: " + error.message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

// Helper function to retrieve details of files by their unique IDs
async function getFileDetails(fileUniqueIds, env) {
  const placeholders = fileUniqueIds.map(() => '?').join(',');
  const sql = `SELECT file_id, file_name, mime_type, type FROM files WHERE file_unique_id IN (${placeholders})`;

  try {
    const stmt = env.DSQL.prepare(sql).bind(...fileUniqueIds);
    const files = await stmt.all();
    return files.results || [];
  } catch (error) {
    console.error('Error fetching file details:', error);
    return [];
  }
}

async function sendFileToUser(chatId, file, env) {
  // Determine the appropriate method for sending the file
  const method = {
    'document': 'sendDocument',
    'audio': 'sendAudio',
    'video': 'sendVideo',
    'photo': 'sendPhoto'
  }[file.type];

  // Check if file_id is undefined before making the request
  if (!file.file_id) {
    console.error(`Error: Missing file_id for Chat ID: ${chatId}. File data:`, file);
    return;
  }

  // Construct the request payload
  const requestBody = {
    method,
    chat_id: chatId,
    [file.type === 'photo' ? 'photo' : 'document']: file.file_id
    // caption: `*File Name:* ${file.file_name}\n*Type:* ${file.type}`,
    // parse_mode: "Markdown"
  };

  console.info(`Sending file to user. Chat ID: ${chatId}, File ID: ${file.file_id}, File Type: ${file.type}, Method: ${method}`);

  try {
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (response.ok) {
      console.info(`File sent successfully to Chat ID: ${chatId}, File ID: ${file.file_id}`);
    } else {
      const errorText = await response.text();
      console.error(`Failed to send file. Chat ID: ${chatId}, File ID: ${file.file_id}, Status: ${response.status}, Error: ${errorText}`);
    }
  } catch (error) {
    console.error(`Error while sending file to Chat ID: ${chatId}, File ID: ${file.file_id}. Error: ${error.message}`);
  }
}

// New function to show all batch IDs for a user
async function showAllBatches(chatId, env) {
  try {
    const sql = `SELECT batch_id FROM batches WHERE user_id = ?;`;
    const stmt = await env.DSQL.prepare(sql).bind(chatId);
    const result = await stmt.all();

    if (result.results.length === 0) {
      return new Response(
        JSON.stringify({
          method: "sendMessage",
          chat_id: chatId,
          text: "You have no batches created yet.",
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=UTF-8'
          }
        }
      );
    }

    // Create batch IDs with clickable links
    const baseUrl = `https://t.me/${env.BOT_USERNAME}?start=`; // Replace 'botusername' with your actual bot username
    const batchLinks = result.results.map(row => {
      return `[${row.batch_id}](${baseUrl}${row.batch_id})`; // Create Markdown link for each batch ID
    }).join(" ");

    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: `Your batch IDs:\n${batchLinks}`,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );

  } catch (error) {
    console.error('Error retrieving batch IDs:', error);
    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: "Error retrieving batch IDs: " + error.message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}
