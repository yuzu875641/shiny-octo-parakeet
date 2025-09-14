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
  const accountId = req.body.webhook_event.account_id;
  const body = req.body.webhook_event.body;

  // 特定のアカウントからのメッセージを無視する
  if (accountId === 10617115) {
    return res.sendStatus(200);
  }

  // 「画像送ってみて」という投稿に反応する
  if (body === '画像送ってみて') {
    try {
      // 1. 画像をダウンロードして一時ファイルに保存
      const filePath = await downloadRandomImage();
      // 2. Chatworkにファイルをアップロード
      const fileId = await uploadImageToChatwork(filePath, req.body.webhook_event.room_id);
      // 3. ファイルIDを含めて返信メッセージを送信
      await sendFileReply(fileId, req.body.webhook_event);

      return res.sendStatus(200);
    } catch (error) {
      console.error("全体の処理でエラーが発生:", error);
      return res.sendStatus(500); // エラー発生時は500を返す
    }
  }

  // それ以外のメッセージには何もしない
  return res.sendStatus(200);
});

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

/**
 * 一時ファイルをChatworkにアップロードします。
 * 成功・失敗に関わらず、アップロード後にファイルを削除します。
 * @param {string} filePath - アップロードするファイルのパス
 * @param {string} roomId - アップロード先のルームID
 * @returns {number} アップロードしたファイルのID
 */
async function uploadImageToChatwork(filePath, roomId) {
  let fileId = null;

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
    fileId = response.data.file_id;
    return fileId;
  } catch (error) {
    console.error("ファイルアップロードエラー:", error.response?.data || error.message);
    throw error;
  } finally {
    // 成功・失敗に関わらず、ファイルを削除
    if (await fs.stat(filePath).catch(() => null)) { // ファイルが存在するか確認
      await fs.unlink(filePath);
      console.log("一時ファイルを削除しました:", filePath);
    }
  }
}

/**
 * ファイルIDを含んだ返信メッセージを送信します。
 * @param {number} fileId - 添付するファイルのID
 * @param {object} webhookEvent - Webhookイベントデータ
 */
async function sendFileReply(fileId, webhookEvent) {
  const accountId = webhookEvent.account_id;
  const roomId = webhookEvent.room_id;
  const messageId = webhookEvent.message_id;

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
