// lib/pollHelpers.ts
import { databases, DATABASE_ID, COLLECTIONS } from "@/lib/appwrite";
import { Query, ID, Permission, Role } from "appwrite";

export interface PollData {
  groupId: string;
  creatorId: string;
  creatorName: string;
  type: "movie" | "place";
  externalId: string;
  title: string;
  description?: string;
  image?: string;
  metadata?: Record<string, any>;
}

/**
 * Creates a new poll and automatically deactivates any existing active polls in the group
 */
export const createPoll = async (pollData: PollData): Promise<any> => {
  try {
    // Step 1: Fetch all polls in this group
    const existingPolls = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.POLLS,
      [Query.equal("groupId", pollData.groupId)]
    );

    // Step 2: Deactivate all active polls in this group
    const deactivatePromises = existingPolls.documents
      .filter((poll: any) => poll.active)
      .map((poll: any) =>
        databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.POLLS,
          poll.$id,
          { active: false }
        )
      );

    await Promise.all(deactivatePromises);

    // Step 3: Create the new poll
    const newPoll = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.POLLS,
      ID.unique(),
      {
        groupId: pollData.groupId,
        creatorId: pollData.creatorId,
        creatorName: pollData.creatorName,
        type: pollData.type,
        externalId: pollData.externalId,
        title: pollData.title,
        description: pollData.description || "",
        image: pollData.image || "",
        choices: ["join", "maybe", "no"],
        active: true,
        metadata: JSON.stringify(pollData.metadata || {}),
      },
      [
        Permission.read(Role.any()),
        Permission.update(Role.user(pollData.creatorId)),
        Permission.delete(Role.user(pollData.creatorId)),
      ]
    );

    return newPoll;
  } catch (error) {
    console.error("Error creating poll:", error);
    throw error;
  }
};

/**
 * Deletes a poll (only if user is the creator)
 */
export const deletePoll = async (pollId: string, userId: string): Promise<void> => {
  try {
    // First, verify the user is the creator
    const poll = await databases.getDocument(
      DATABASE_ID,
      COLLECTIONS.POLLS,
      pollId
    );

    if ((poll as any).creatorId !== userId) {
      throw new Error("You don't have permission to delete this poll");
    }

    // Delete all votes associated with this poll
    const votes = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.VOTES,
      [Query.equal("pollId", pollId)]
    );

    const deleteVotesPromises = votes.documents.map((vote: any) =>
      databases.deleteDocument(DATABASE_ID, COLLECTIONS.VOTES, vote.$id)
    );

    await Promise.all(deleteVotesPromises);

    // Delete the poll
    await databases.deleteDocument(DATABASE_ID, COLLECTIONS.POLLS, pollId);
  } catch (error) {
    console.error("Error deleting poll:", error);
    throw error;
  }
};

/**
 * Deactivates a poll (marks it as inactive)
 */
export const deactivatePoll = async (pollId: string, userId: string): Promise<void> => {
  try {
    // Verify the user is the creator
    const poll = await databases.getDocument(
      DATABASE_ID,
      COLLECTIONS.POLLS,
      pollId
    );

    if ((poll as any).creatorId !== userId) {
      throw new Error("You don't have permission to deactivate this poll");
    }

    // Update poll to inactive
    await databases.updateDocument(
      DATABASE_ID,
      COLLECTIONS.POLLS,
      pollId,
      { active: false }
    );
  } catch (error) {
    console.error("Error deactivating poll:", error);
    throw error;
  }
};

/**
 * Activates a poll (marks it as active and deactivates others in the group)
 */
export const activatePoll = async (pollId: string, userId: string): Promise<void> => {
  try {
    // Verify the user is the creator
    const poll = await databases.getDocument(
      DATABASE_ID,
      COLLECTIONS.POLLS,
      pollId
    );

    if ((poll as any).creatorId !== userId) {
      throw new Error("You don't have permission to activate this poll");
    }

    // Deactivate all other polls in the same group
    const groupId = (poll as any).groupId;
    const existingPolls = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.POLLS,
      [Query.equal("groupId", groupId), Query.equal("active", true)]
    );

    const deactivatePromises = existingPolls.documents
      .filter((p: any) => p.$id !== pollId)
      .map((p: any) =>
        databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.POLLS,
          p.$id,
          { active: false }
        )
      );

    await Promise.all(deactivatePromises);

    // Activate this poll
    await databases.updateDocument(
      DATABASE_ID,
      COLLECTIONS.POLLS,
      pollId,
      { active: true }
    );
  } catch (error) {
    console.error("Error activating poll:", error);
    throw error;
  }
};

/**
 * Gets the active poll for a group
 */
export const getActivePoll = async (groupId: string): Promise<any | null> => {
  try {
    const polls = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.POLLS,
      [
        Query.equal("groupId", groupId),
        Query.equal("active", true),
        Query.limit(1)
      ]
    );

    return polls.documents[0] || null;
  } catch (error) {
    console.error("Error getting active poll:", error);
    return null;
  }
};

/**
 * Gets all polls for a group
 */
export const getGroupPolls = async (groupId: string): Promise<any[]> => {
  try {
    const polls = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.POLLS,
      [
        Query.equal("groupId", groupId),
        Query.orderDesc("$createdAt"),
        Query.limit(100)
      ]
    );

    return polls.documents;
  } catch (error) {
    console.error("Error getting group polls:", error);
    return [];
  }
};

/**
 * Gets votes for a specific poll
 */
export const getPollVotes = async (pollId: string): Promise<any[]> => {
  try {
    const votes = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.VOTES,
      [Query.equal("pollId", pollId)]
    );

    return votes.documents;
  } catch (error) {
    console.error("Error getting poll votes:", error);
    return [];
  }
};

/**
 * Casts or updates a vote
 */
export const castVote = async (
  pollId: string,
  userId: string,
  choice: "join" | "maybe" | "no"
): Promise<void> => {
  try {
    // Check if user already voted
    const existingVotes = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.VOTES,
      [Query.equal("pollId", pollId), Query.equal("userId", userId)]
    );

    if (existingVotes.documents.length > 0) {
      // Update existing vote
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.VOTES,
        existingVotes.documents[0].$id,
        { choice }
      );
    } else {
      // Create new vote
      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.VOTES,
        ID.unique(),
        {
          pollId,
          userId,
          choice,
        }
      );
    }
  } catch (error) {
    console.error("Error casting vote:", error);
    throw error;
  }
};

/**
 * Gets vote counts for a poll
 */
export const getVoteCounts = (votes: any[]): { join: number; maybe: number; no: number } => {
  const counts = { join: 0, maybe: 0, no: 0 };
  
  votes.forEach((vote) => {
    if (vote.choice in counts) {
      counts[vote.choice as keyof typeof counts]++;
    }
  });

  return counts;
};

/**
 * Checks if a user has voted on a poll
 */
export const hasUserVoted = (votes: any[], userId: string): any | null => {
  return votes.find((vote) => vote.userId === userId) || null;
};

/**
 * Announces a poll in the group chat
 */
export const announcePoll = async (
  groupId: string,
  pollId: string,
  pollTitle: string,
  senderId: string,
  senderName: string,
  senderAvatar?: string
): Promise<void> => {
  try {
    await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.MESSAGES,
      ID.unique(),
      {
        groupId,
        senderId,
        senderName,
        senderAvatar: senderAvatar || "",
        text: `📊 New poll created: ${pollTitle}`,
        createdAt: new Date().toISOString(),
        reactions: JSON.stringify([]),
        pollId,
      }
    );
  } catch (error) {
    console.error("Error announcing poll:", error);
    // Don't throw - this is not critical
  }
};

/**
 * Parse metadata from JSON string
 */
export const parseMetadata = (metadataString: string): Record<string, any> => {
  try {
    return JSON.parse(metadataString || "{}");
  } catch {
    return {};
  }
};