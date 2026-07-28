/* ============================================================
   firebase-service.js
   Firebase Authentication と Firestore への読み書きをまとめた薄いラッパー。
   index.html で firebase-app-compat.js / firebase-auth-compat.js /
   firebase-firestore-compat.js と config.js を読み込んだ後に読み込んでください。

   ▼ 認証方式について（初心者向け解説）
   このアプリは1人（あなた専用）で使うことを前提にしています。
   画面にはGoogleログインなどは出さず、「PINコード（暗証番号）」だけを
   入力する形にしています。

   ただし、Firestore（データベース）に安全にアクセスするには、
   Firebaseの「認証済みユーザー」であることが必要です。
   そこで内部的には、Firebaseの「メールアドレス／パスワード認証」を
   次のように"流用"しています。

     ・メールアドレス = config.js の APP_AUTH_EMAIL（固定・画面には出さない）
     ・パスワード     = 画面で入力してもらう「PINコード」

   つまり、あなたから見ると「PINを入力するだけ」ですが、
   Firebase内部では通常のメール/パスワード認証として扱われるため、
   特別な仕組み（サーバーやCloud Functions）を追加せずに実現できています。

   初回だけ、入力したPINでアカウントが自動的に作成されます。
   2回目以降は、同じPINでログインするだけです。
============================================================ */
(function () {
  if (!window.firebase) {
    console.error("Firebase SDK が読み込まれていません。index.html の読み込み順を確認してください。");
    return;
  }
  if (!window.FIREBASE_CONFIG) {
    console.error("FIREBASE_CONFIG が見つかりません。config.js を作成してください（config.example.js を参照）。");
    return;
  }
  if (!window.APP_AUTH_EMAIL) {
    console.error("APP_AUTH_EMAIL が見つかりません。config.js にあなたのメールアドレスを設定してください。");
    return;
  }

  firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();

  // ブラウザを閉じても・別タブでも、ログイン状態を保持する（毎回PINを聞かない）
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((e) => {
    console.warn("ログイン状態の保持設定に失敗しました", e);
  });

  // オフラインでもある程度使えるように、可能ならローカルキャッシュを有効化する（失敗しても致命的ではない）
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    console.warn("Firestoreのオフラインキャッシュを有効化できませんでした:", err.code);
  });

  const FIXED_EMAIL = window.APP_AUTH_EMAIL;
  const MIN_PIN_LENGTH = 6; // Firebaseの仕様上、パスワード（=PIN）は6文字以上が必要

  function userDocRef(uid) {
    return db.collection("users").doc(uid);
  }

  const FirebaseService = {
    MIN_PIN_LENGTH,

    /**
     * ログイン状態の変化を監視する。
     * callback(user | null) が呼ばれる。user は firebase の User オブジェクト。
     * 戻り値は購読解除用の関数。
     */
    onAuthChange(callback) {
      return auth.onAuthStateChanged(callback);
    },

    /**
     * PINコードでログインする。
     *
     * 実装メモ（はまりやすいポイント）：
     * Firebaseの新しいプロジェクトには「メール列挙保護」という機能があり、
     * 「そのメールアドレスのアカウントが存在するかどうか」を外部から
     * 推測されないよう、本来 auth/user-not-found となるべきところが
     * auth/invalid-credential として返ってくることがあります。
     * そのため「まずログインを試して、失敗したら新規登録する」という
     * 順番だと、初回利用なのに「PINが違います」と誤判定してしまいます。
     *
     * これを避けるため、ここでは順番を逆にしています：
     *   1. まず createUserWithEmailAndPassword を試す
     *      → 初回利用ならここで成功し、そのPINで登録完了
     *      → 2回目以降は auth/email-already-in-use で必ず失敗する
     *   2. auth/email-already-in-use だった場合だけ、
     *      signInWithEmailAndPassword で改めてログインを試す
     *      → ここでPINが合っていれば成功、違っていれば失敗する
     *
     * 戻り値: { ok: true, created: boolean } または
     *        { ok: false, reason: "short"|"wrong"|"other", message: string }
     */
    async signInWithPin(pin) {
      if (!pin || pin.length < MIN_PIN_LENGTH) {
        return { ok: false, reason: "short", message: `PINは${MIN_PIN_LENGTH}文字以上で入力してください。` };
      }
      try {
        // 1. まず新規登録を試みる（初回利用ならここで完了）
        await auth.createUserWithEmailAndPassword(FIXED_EMAIL, pin);
        return { ok: true, created: true };
      } catch (e) {
        if (e.code === "auth/email-already-in-use") {
          // 2. すでにアカウントがある＝2回目以降の利用。入力されたPINでログインを試す
          try {
            await auth.signInWithEmailAndPassword(FIXED_EMAIL, pin);
            return { ok: true, created: false };
          } catch (signInErr) {
            if (
              signInErr.code === "auth/wrong-password" ||
              signInErr.code === "auth/invalid-credential" ||
              signInErr.code === "auth/invalid-login-credentials"
            ) {
              return { ok: false, reason: "wrong", message: "PINが違います。もう一度お試しください。" };
            }
            if (signInErr.code === "auth/too-many-requests") {
              return { ok: false, reason: "other", message: "試行回数が多すぎます。しばらく待ってから再度お試しください。" };
            }
            return { ok: false, reason: "other", message: `ログインに失敗しました（${signInErr.message}）` };
          }
        }
        if (e.code === "auth/weak-password") {
          return { ok: false, reason: "short", message: `PINは${MIN_PIN_LENGTH}文字以上で、もう少し複雑にしてください。` };
        }
        if (e.code === "auth/operation-not-allowed") {
          return { ok: false, reason: "other", message: "Firebaseコンソールで「メール/パスワード」認証が有効になっていません。README手順3を確認してください。" };
        }
        return { ok: false, reason: "other", message: `ログインに失敗しました（${e.message}）` };
      }
    },

    /** PINを忘れた場合、登録済みのメールアドレス（APP_AUTH_EMAIL）宛に再設定メールを送る */
    async sendPinResetEmail() {
      await auth.sendPasswordResetEmail(FIXED_EMAIL);
    },

    async signOut() {
      await auth.signOut();
    },

    getCurrentUser() {
      return auth.currentUser;
    },

    /** ユーザーのデータを読み込む。存在しなければ null を返す。 */
    async loadUserData(uid) {
      const snap = await userDocRef(uid).get();
      return snap.exists ? snap.data() : null;
    },

    /** ユーザーのデータを書き込む（ドキュメント全体を置き換え） */
    async saveUserData(uid, data) {
      await userDocRef(uid).set(
        { ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: false }
      );
    },
  };

  window.FirebaseService = FirebaseService;
})();
