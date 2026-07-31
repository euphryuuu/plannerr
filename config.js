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
  apiKey: "AIzaSyAe3Pb3n43lxAlbIPeHXNSf4tBuSFZDZ1Q",
  authDomain: "weekly-planner-22bf3.firebaseapp.com",
  projectId: "weekly-planner-22bf3",
  storageBucket: "weekly-planner-22bf3.firebasestorage.app",
  messagingSenderId: "1060882519640",
  appId: "1:1060882519640:web:1c5d2f327e1ae1ca089c2d"
};

/* ------------------------------------------------------------
   PINログインの内部で使うメールアドレス。
   ・画面には一切表示されません（あなた専用のログイン識別子です）。
   ・あなたが実際に受信できるメールアドレスにしてください。
     → PINを忘れた場合の「再設定メール」の送り先になります。
   ・Googleアカウントである必要はありません（どのメールアドレスでもOK）。
------------------------------------------------------------ */
window.APP_AUTH_EMAIL = "euph.ryunosuke555@gmail.com";

