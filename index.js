const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');
const app = express();
app.use(express.json());

const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;

// ウェブフックのエンドポイント
app.post('/webhook', async (req, res) => {
  // Webhookペイロードから必要な情報を直接抽出する
  const webhookEvent = req.body.webhook_event;
  if (!webhookEvent) {
    console.error("Invalid webhook payload received.");
    return res.status(400).send("Bad Request: Invalid payload");
  }

  const { account_id: accountId, body, room_id: roomId, message_id: messageId } = webhookEvent;

  // 特定のアカウントからのメッセージを無視する
  if (accountId === 10617115) {
    console.log(`無視するアカウントIDからのメッセージを受信しました: ${accountId}`);
    return res.sendStatus(200);
  }

  // 「画像送ってみて」という投稿に反応する
  if (body === '画像送ってみて') {
    console.log(`「画像送ってみて」メッセージを受信しました。roomId: ${roomId}, accountId: ${accountId}`);

    try {
      // 1. 画像をダウンロードして一時ファイルに保存
      const filePath = await downloadRandomImage();
      
      // 2. Chatworkにファイルをアップロード
      const fileId = await uploadImageToChatwork(filePath, roomId);
      
      // 3. ファイルIDを含めて返信メッセージを送信
      await sendFileReply(fileId, { accountId, roomId, messageId });
      
      return res.sendStatus(200);
    } catch (error) {
      console.error("画像送信処理でエラーが発生:", error);
      return res.sendStatus(500); // エラー発生時は500を返す
    }
  }

  // それ以外のメッセージには何もしない
  console.log(`その他のメッセージを受信しました: ${body}`);
  return res.sendStatus(200);
});

// ---

/**
 * ランダムな画像をダウンロードし、一時ファイルとして保存します。
 * @returns {string} 保存されたファイルのパス
 */
async function downloadRandomImage() {
  const imageUrl = 'https://pic.re/image';
  const filePath = path.join('/tmp', `image_${Date.now()}.jpg`);

  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer'
    });
    await fs.writeFile(filePath, response.data);
    console.log("画像ダウンロード成功:", filePath);
    return filePath;
  } catch (error) {
    console.error("画像ダウンロードエラー:", error);
    throw error;
  }
}

// ---

/**
 * 一時ファイルをChatworkにアップロードします。
 * 成功・失敗に関わらず、アップロード後にファイルを削除します。
 * @param {string} filePath - アップロードするファイルのパス
 * @param {string} roomId - アップロード先のルームID
 * @returns {number} アップロードしたファイルのID
 */
async function uploadImageToChatwork(filePath, roomId) {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    const response = await axios.post(
      `https://api.chatwork.com/v2/rooms/${roomId}/files`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'X-ChatWorkToken': CHATWORK_API_TOKEN,
        },
      }
    );
    console.log("ファイルアップロード成功:", response.data);
    return response.data.file_id;
  } catch (error) {
    console.error("ファイルアップロードエラー:", error.response?.data || error.message);
    throw error;
  } finally {
    // 成功・失敗に関わらず、ファイルを削除
    try {
        await fs.unlink(filePath);
        console.log("一時ファイルを削除しました:", filePath);
    } catch (err) {
        console.error("一時ファイルの削除に失敗しました:", err);
    }
  }
}

// ---

/**
 * ファイルIDを含んだ返信メッセージを送信します。
 * @param {number} fileId - 添付するファイルのID
 * @param {object} replyData - 返信に必要なデータ { accountId, roomId, messageId }
 */
async function sendFileReply(fileId, replyData) {
  const { accountId, roomId, messageId } = replyData;

  try {
    const message = `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\n画像です！\n[file:${fileId}]`;

    await axios.post(
      `https://api.chatwork.com/v2/rooms/${roomId}/messages`,
      new URLSearchParams({ body: message }),
      {
        headers: {
          "X-ChatWorkToken": CHATWORK_API_TOKEN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    console.log("ファイル添付メッセージ送信成功");
  } catch (error) {
    console.error("メッセージ送信エラー:", error.response?.data || error.message);
    throw error;
  }
}

// サーバーを起動
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
