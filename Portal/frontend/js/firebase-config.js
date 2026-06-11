(function bootstrapFirebaseConfigLoader() {
  const apiUrl = window.location.protocol === "file:"
    ? "http://localhost:3000/api/firebase-config"
    : "/api/firebase-config";
  const requiredKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];

  async function loadImsFirebaseConfig() {
    if (window.IMS_FIREBASE_CONFIG) return window.IMS_FIREBASE_CONFIG;

    const response = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    const firebaseConfig = payload?.firebase;

    if (!response.ok || !payload?.success || !firebaseConfig) {
      throw new Error("Unable to load IMS Firebase configuration.");
    }

    const missing = requiredKeys.filter((key) => !firebaseConfig[key]);
    if (missing.length) {
      throw new Error(`IMS Firebase configuration is incomplete: ${missing.join(", ")}`);
    }

    window.IMS_FIREBASE_CONFIG = firebaseConfig;
    return firebaseConfig;
  }

  window.loadImsFirebaseConfig = loadImsFirebaseConfig;
  window.imsFirebaseConfigReady = loadImsFirebaseConfig();
})();
