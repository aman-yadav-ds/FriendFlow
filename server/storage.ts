import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import type {
  User,
  InsertUser,
  UpdateUser,
  Group,
  InsertGroup,
  GroupMember,
  Message,
  InsertMessage,
  Poll,
  InsertPoll,
  Vote,
  InsertVote,
  Reaction,
  InsertReaction,
  MessageWithUser,
  PollWithVotes,
  GroupWithMembers,
} from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export interface IStorage {
  // Users
  createUser(user: InsertUser): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  updateUser(id: string, data: UpdateUser): Promise<User>;

  // Groups
  createGroup(name: string, createdBy: string): Promise<Group>;
  getGroupById(id: string): Promise<GroupWithMembers | undefined>;
  getGroupsByUserId(userId: string): Promise<GroupWithMembers[]>;
  addGroupMember(groupId: string, userId: string): Promise<GroupMember>;
  getGroupMembers(groupId: string): Promise<(GroupMember & { user: User })[]>;

  // Messages
  createMessage(message: InsertMessage & { userId: string }): Promise<Message>;
  getMessagesByGroupId(groupId: string): Promise<MessageWithUser[]>;

  // Polls
  createPoll(poll: InsertPoll & { createdBy: string }): Promise<Poll>;
  getPollsByGroupId(groupId: string): Promise<PollWithVotes[]>;
  getPollById(id: string): Promise<PollWithVotes | undefined>;

  // Votes
  createOrUpdateVote(vote: InsertVote & { userId: string }): Promise<Vote>;
  getVotesByPollId(pollId: string): Promise<(Vote & { user: User })[]>;

  // Reactions
  toggleReaction(reaction: InsertReaction & { userId: string }): Promise<void>;
  getReactionsByMessageId(messageId: string): Promise<(Reaction & { user: User })[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(schema.users).values(insertUser).returning();
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email));
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id));
    return user;
  }

  async updateUser(id: string, data: UpdateUser): Promise<User> {
    const [user] = await db
      .update(schema.users)
      .set(data)
      .where(eq(schema.users.id, id))
      .returning();
    return user;
  }

  // Groups
  async createGroup(name: string, createdBy: string): Promise<Group> {
    const inviteCode = Math.random().toString(36).substring(2, 10);
    const [group] = await db
      .insert(schema.groups)
      .values({ name, createdBy, inviteCode })
      .returning();
    
    // Add creator as member
    await db.insert(schema.groupMembers).values({
      groupId: group.id,
      userId: createdBy,
    });

    return group;
  }

  async getGroupById(id: string): Promise<GroupWithMembers | undefined> {
    const [group] = await db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, id));
    
    if (!group) return undefined;

    const members = await this.getGroupMembers(id);
    const [creator] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, group.createdBy));

    const [lastMessage] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.groupId, id))
      .orderBy(desc(schema.messages.createdAt))
      .limit(1);

    return { ...group, members, creator, lastMessage };
  }

  async getGroupsByUserId(userId: string): Promise<GroupWithMembers[]> {
    const memberships = await db
      .select()
      .from(schema.groupMembers)
      .where(eq(schema.groupMembers.userId, userId));

    const groups = await Promise.all(
      memberships.map(async (membership) => {
        return await this.getGroupById(membership.groupId);
      })
    );

    return groups.filter((g): g is GroupWithMembers => g !== undefined);
  }

  async addGroupMember(groupId: string, userId: string): Promise<GroupMember> {
    const [member] = await db
      .insert(schema.groupMembers)
      .values({ groupId, userId })
      .returning();
    return member;
  }

  async getGroupMembers(groupId: string): Promise<(GroupMember & { user: User })[]> {
    const members = await db
      .select()
      .from(schema.groupMembers)
      .where(eq(schema.groupMembers.groupId, groupId));

    const membersWithUsers = await Promise.all(
      members.map(async (member) => {
        const [user] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, member.userId));
        return { ...member, user };
      })
    );

    return membersWithUsers;
  }

  // Messages
  async createMessage(message: InsertMessage & { userId: string }): Promise<Message> {
    const [newMessage] = await db
      .insert(schema.messages)
      .values(message)
      .returning();
    return newMessage;
  }

  async getMessagesByGroupId(groupId: string): Promise<MessageWithUser[]> {
    const messages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.groupId, groupId))
      .orderBy(schema.messages.createdAt);

    const messagesWithData = await Promise.all(
      messages.map(async (message) => {
        const [user] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, message.userId));

        const reactions = await this.getReactionsByMessageId(message.id);

        let poll = undefined;
        if (message.pollId) {
          poll = await this.getPollById(message.pollId);
        }

        return { ...message, user, reactions, poll };
      })
    );

    return messagesWithData;
  }

  // Polls
  async createPoll(poll: InsertPoll & { createdBy: string }): Promise<Poll> {
    const [newPoll] = await db.insert(schema.polls).values(poll).returning();
    return newPoll;
  }

  async getPollsByGroupId(groupId: string): Promise<PollWithVotes[]> {
    const polls = await db
      .select()
      .from(schema.polls)
      .where(eq(schema.polls.groupId, groupId))
      .orderBy(desc(schema.polls.createdAt));

    const pollsWithVotes = await Promise.all(
      polls.map(async (poll) => {
        const votes = await this.getVotesByPollId(poll.id);
        const [creator] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, poll.createdBy));
        return { ...poll, votes, creator };
      })
    );

    return pollsWithVotes;
  }

  async getPollById(id: string): Promise<PollWithVotes | undefined> {
    const [poll] = await db
      .select()
      .from(schema.polls)
      .where(eq(schema.polls.id, id));

    if (!poll) return undefined;

    const votes = await this.getVotesByPollId(id);
    const [creator] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, poll.createdBy));

    return { ...poll, votes, creator };
  }

  // Votes
  async createOrUpdateVote(vote: InsertVote & { userId: string }): Promise<Vote> {
    // Check if user already voted
    const [existingVote] = await db
      .select()
      .from(schema.votes)
      .where(
        and(
          eq(schema.votes.pollId, vote.pollId),
          eq(schema.votes.userId, vote.userId)
        )
      );

    if (existingVote) {
      // Update existing vote
      const [updated] = await db
        .update(schema.votes)
        .set({ choice: vote.choice })
        .where(eq(schema.votes.id, existingVote.id))
        .returning();
      return updated;
    } else {
      // Create new vote
      const [newVote] = await db.insert(schema.votes).values(vote).returning();
      return newVote;
    }
  }

  async getVotesByPollId(pollId: string): Promise<(Vote & { user: User })[]> {
    const votes = await db
      .select()
      .from(schema.votes)
      .where(eq(schema.votes.pollId, pollId));

    const votesWithUsers = await Promise.all(
      votes.map(async (vote) => {
        const [user] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, vote.userId));
        return { ...vote, user };
      })
    );

    return votesWithUsers;
  }

  // Reactions
  async toggleReaction(reaction: InsertReaction & { userId: string }): Promise<void> {
    // Check if reaction exists
    const [existing] = await db
      .select()
      .from(schema.reactions)
      .where(
        and(
          eq(schema.reactions.messageId, reaction.messageId),
          eq(schema.reactions.userId, reaction.userId),
          eq(schema.reactions.emoji, reaction.emoji)
        )
      );

    if (existing) {
      // Remove reaction
      await db
        .delete(schema.reactions)
        .where(eq(schema.reactions.id, existing.id));
    } else {
      // Add reaction
      await db.insert(schema.reactions).values(reaction);
    }
  }

  async getReactionsByMessageId(messageId: string): Promise<(Reaction & { user: User })[]> {
    const reactions = await db
      .select()
      .from(schema.reactions)
      .where(eq(schema.reactions.messageId, messageId));

    const reactionsWithUsers = await Promise.all(
      reactions.map(async (reaction) => {
        const [user] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, reaction.userId));
        return { ...reaction, user };
      })
    );

    return reactionsWithUsers;
  }
}

export const storage = new DatabaseStorage();
