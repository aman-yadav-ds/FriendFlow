// lib/appwrite.ts
import { Client, Databases, Account, Models } from "appwrite";

// Initialize Appwrite Client
export const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1")
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || "YOUR_PROJECT_ID");

export const databases = new Databases(client);
export const account = new Account(client);

// Database and Collection IDs
export const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "YOUR_DATABASE_ID";

export const COLLECTIONS = {
  GROUPS: import.meta.env.VITE_APPWRITE_COLLECTION_GROUPS,
  MESSAGES: import.meta.env.VITE_APPWRITE_COLLECTION_MESSAGES,
  POLLS: import.meta.env.VITE_APPWRITE_COLLECTION_POLLS,
  VOTES: import.meta.env.VITE_APPWRITE_COLLECTION_VOTES,
  USERS: import.meta.env.VITE_APPWRITE_COLLECTION_USERS,
  REACTIONS: import.meta.env.VITE_APPWRITE_COLLECTION_REACTIONS,
};

// Helper types
export interface AppwriteUser {
  $id: string;
  name: string;
  email: string;
  avatar?: string;
}

// Auth helpers
export const getCurrentUser = async (): Promise<Models.User<Models.Preferences> | null> => {
  try {
    const jwt = localStorage.getItem("appwrite_jwt");
    if (jwt) client.setJWT(jwt);
    const user = await account.get();
    return user;
  } catch {
    return null;
  }
};


export const login = async (email: string, password: string) => {
  try {
    await account.createEmailPasswordSession(email, password);
    const jwt = await account.createJWT();
    localStorage.setItem("appwrite_jwt", jwt.jwt);
    client.setJWT(jwt.jwt);
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
  } catch {}
  localStorage.removeItem("appwrite_jwt");
};
