// lib/appwrite.ts
import { Client, Databases, Account } from "appwrite";

// Initialize Appwrite Client
export const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1")
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || "YOUR_PROJECT_ID");

export const databases = new Databases(client);
export const account = new Account(client);

// Database and Collection IDs
export const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "YOUR_DATABASE_ID";

export const COLLECTIONS = {
  GROUPS: import.meta.env.VITE_APPWRITE_COLLECTION_GROUPS || "groups",
  MESSAGES: import.meta.env.VITE_APPWRITE_COLLECTION_MESSAGES || "messages",
  POLLS: import.meta.env.VITE_APPWRITE_COLLECTION_POLLS || "polls",
  VOTES: import.meta.env.VITE_APPWRITE_COLLECTION_VOTES || "votes",
  USERS: import.meta.env.VITE_APPWRITE_COLLECTION_USERS || "users",
};

// Helper types
export interface AppwriteUser {
  $id: string;
  name: string;
  email: string;
  avatar?: string;
}

// Auth helpers
export const getCurrentUser = async (): Promise<AppwriteUser | null> => {
  try {
    const user = await account.get();
    return {
      $id: user.$id,
      name: user.name,
      email: user.email,
      avatar: user.prefs?.avatar,
    };
  } catch (error) {
    return null;
  }
};

export const login = async (email: string, password: string) => {
  try {
    await account.createEmailPasswordSession(email, password);
    return await getCurrentUser();
  } catch (error) {
    throw error;
  }
};

export const register = async (email: string, password: string, name: string) => {
  try {
    await account.create("unique()", email, password, name);
    await account.createEmailPasswordSession(email, password);
    return await getCurrentUser();
  } catch (error) {
    throw error;
  }
};

export const logout = async () => {
  try {
    await account.deleteSession("current");
  } catch (error) {
    throw error;
  }
};