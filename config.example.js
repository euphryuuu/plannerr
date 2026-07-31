/* ============================================================
   config.example.js
   このファイルを "config.js" という名前でコピーし、
   あなたのFirebaseプロジェクトの値に書き換えてください。

   値の取得場所:
   Firebaseコンソール > プロジェクトの設定（歯車アイコン）> 全般
   > マイアプリ（ウェブアプリ）> SDK の設定と構成 > 「Config」を選択

   これらの値は「公開情報」であり、隠す必要はありません。
   実際のアクセス制御は Firestore のセキュリティルール（firestore.rules）で行います。
============================================================ */
window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

/* ------------------------------------------------------------
   PINログインの内部で使うメールアドレス。
   ・画面には一切表示されません（あなた専用のログイン識別子です）。
   ・あなたが実際に受信できるメールアドレスにしてください。
     → PINを忘れた場合の「再設定メール」の送り先になります。
   ・Googleアカウントである必要はありません（どのメールアドレスでもOK）。
------------------------------------------------------------ */
window.APP_AUTH_EMAIL = "your-email@example.com";

