
import admin from 'firebase-admin';

// Helper function to ensure the admin app is initialized
function initializeAdminApp(): admin.app.App {
  const projectIdFromEnv = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  console.log(`Firebase Admin SDK: Detected NEXT_PUBLIC_FIREBASE_PROJECT_ID from server environment: ${projectIdFromEnv}`);

  if (admin.apps.length) {
    const existingApp = admin.app();
    console.log(`Firebase Admin SDK: App already initialized. Name: ${existingApp.name}. Project ID from existing app: ${existingApp.options.projectId}`);
    // If the existing app doesn't have a projectId and we have one from env, this indicates a potential issue.
    // However, re-initializing can be problematic. For now, just log and use existing.
    if (!existingApp.options.projectId && projectIdFromEnv) {
        console.warn(`Firebase Admin SDK: Existing app was initialized without a projectId, but NEXT_PUBLIC_FIREBASE_PROJECT_ID (${projectIdFromEnv}) is available. This might lead to issues if the ADC didn't pick up the project correctly initially.`);
    }
    return existingApp;
  }

  try {
    const appConfig: admin.AppOptions = {};
    if (projectIdFromEnv) {
      appConfig.projectId = projectIdFromEnv;
      console.log(`Firebase Admin SDK: Attempting to initializeApp() with explicit projectId: ${projectIdFromEnv}`);
    } else {
      console.warn('Firebase Admin SDK: NEXT_PUBLIC_FIREBASE_PROJECT_ID is not available in the server environment. Attempting to initializeApp() with Application Default Credentials (hoping it discovers the project automatically).');
    }

    admin.initializeApp(appConfig);
    console.log('Firebase Admin SDK: initializeApp() successfully called.');

    const defaultApp = admin.app();
    if (defaultApp && defaultApp.options.projectId) {
      console.log(`Firebase Admin SDK: Initialized. Effective Project ID from SDK: ${defaultApp.options.projectId}`);
      if (projectIdFromEnv && defaultApp.options.projectId !== projectIdFromEnv) {
        console.error(`Firebase Admin SDK: CRITICAL MISMATCH! Env projectId: ${projectIdFromEnv}, SDK effective projectId: ${defaultApp.options.projectId}. This will likely cause data access issues.`);
      }
    } else if (defaultApp) {
      console.error('Firebase Admin SDK: Initialized, but the default app has NO Project ID. This means Admin SDK cannot target a specific project and will fail to access Firestore.');
    } else {
      console.error('Firebase Admin SDK: admin.app() returned no app after initializeApp(). Critical initialization failure.');
      throw new Error('Firebase Admin SDK failed to return an app instance after initialization.');
    }
    return defaultApp;
  } catch (error: any) {
    console.error('Firebase Admin SDK: CRITICAL INITIALIZATION ERROR:', error.message, error.stack);
    throw new Error(`Firebase Admin SDK initialization failed: ${error.message}`);
  }
}

let adminAppInstance: admin.app.App;
try {
  adminAppInstance = initializeAdminApp();
} catch (initError) {
  console.error("Firebase Admin SDK: Failed to get an app instance during module load due to initialization error.", initError);
  // This is a critical failure; dependent services won't work.
}

const getAdminDb = (): admin.firestore.Firestore => {
  if (!adminAppInstance || !adminAppInstance.name) {
    console.error("Firebase Admin SDK: App not properly initialized or initialization failed. Cannot get Firestore service.");
    throw new Error("Firebase Admin App is not available. Cannot access Firestore service.");
  }
  return adminAppInstance.firestore();
};

const getAdminAuth = (): admin.auth.Auth => {
  if (!adminAppInstance || !adminAppInstance.name) {
    console.error("Firebase Admin SDK: App not properly initialized or initialization failed. Cannot get Auth service.");
    throw new Error("Firebase Admin App is not available. Cannot access Auth service.");
  }
  return adminAppInstance.auth();
};

const getAdminStorage = (): admin.storage.Storage => {
  if (!adminAppInstance || !adminAppInstance.name) {
    console.error("Firebase Admin SDK: App not properly initialized or initialization failed. Cannot get Storage service.");
    throw new Error("Firebase Admin App is not available. Cannot access Storage service.");
  }
  return adminAppInstance.storage();
};

export { getAdminDb, getAdminAuth, getAdminStorage, admin };
