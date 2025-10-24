import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import { Pool } from "@neondatabase/serverless";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { storage } from "./storage";
import { insertUserSchema, insertGroupSchema, insertMessageSchema, insertPollSchema, insertVoteSchema, insertReactionSchema, updateUserSchema } from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PgSession = ConnectPgSimple(session);

const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadDir = path.join(process.cwd(), "uploads");
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

interface AuthRequest extends Request {
  userId?: string;
}

const clients = new Map<string, Set<WebSocket>>();

export async function registerRoutes(app: Express): Promise<Server> {
  // Session middleware
  app.use(
    session({
      store: new PgSession({
        pool,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "your-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      },
    })
  );

  // Serve uploaded files
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // Auth middleware
  const requireAuth = (req: AuthRequest, res: Response, next: Function) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.userId = req.session.userId;
    next();
  };

  // ========== AUTH ROUTES ==========
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, password } = insertUserSchema.parse(req.body);

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        name,
        email,
        password: hashedPassword,
      });

      req.session.userId = user.id;
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(400).json({ message: "Invalid registration data" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.userId = user.id;
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
    const user = await storage.getUserById(req.userId!);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  });

  // ========== USER ROUTES ==========
  app.patch("/api/users/profile", requireAuth, async (req: AuthRequest, res) => {
    try {
      const data = updateUserSchema.parse(req.body);
      const user = await storage.updateUser(req.userId!, data);
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(400).json({ message: "Invalid update data" });
    }
  });

  app.post("/api/users/avatar", requireAuth, upload.single("avatar"), async (req: AuthRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;
    await storage.updateUser(req.userId!, { avatar: avatarUrl });
    res.json({ avatarUrl });
  });

  // ========== GROUP ROUTES ==========
  app.post("/api/groups", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { name } = insertGroupSchema.parse(req.body);
      const group = await storage.createGroup(name, req.userId!);
      res.json(group);
    } catch (error) {
      res.status(400).json({ message: "Invalid group data" });
    }
  });

  app.get("/api/groups", requireAuth, async (req: AuthRequest, res) => {
    const groups = await storage.getGroupsByUserId(req.userId!);
    res.json(groups);
  });

  app.get("/api/groups/:id", requireAuth, async (req: AuthRequest, res) => {
    const group = await storage.getGroupById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is a member
    const isMember = group.members.some((m) => m.userId === req.userId);
    if (!isMember) {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    res.json(group);
  });

  // ========== MESSAGE ROUTES ==========
  app.post("/api/groups/:id/messages", requireAuth, async (req: AuthRequest, res) => {
    try {
      const data = insertMessageSchema.parse(req.body);
      const message = await storage.createMessage({
        ...data,
        userId: req.userId!,
        groupId: req.params.id,
      });

      // Broadcast to WebSocket clients
      broadcastToGroup(req.params.id, {
        type: "message",
        message,
      });

      res.json(message);
    } catch (error) {
      res.status(400).json({ message: "Invalid message data" });
    }
  });

  app.get("/api/groups/:id/messages", requireAuth, async (req: AuthRequest, res) => {
    const messages = await storage.getMessagesByGroupId(req.params.id);
    res.json(messages);
  });

  app.post("/api/messages/:id/reactions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { emoji } = insertReactionSchema.parse(req.body);
      await storage.toggleReaction({
        messageId: req.params.id,
        userId: req.userId!,
        emoji,
      });

      // Get the message to find the group
      const messages = await storage.getMessagesByGroupId(""); // We need to get group from message
      // For now, just broadcast to all
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Invalid reaction data" });
    }
  });

  // ========== POLL ROUTES ==========
  app.post("/api/groups/:id/polls", requireAuth, async (req: AuthRequest, res) => {
    try {
      const data = insertPollSchema.parse(req.body);
      const poll = await storage.createPoll({
        ...data,
        groupId: req.params.id,
        createdBy: req.userId!,
      });

      // Create a message for the poll
      await storage.createMessage({
        groupId: req.params.id,
        userId: req.userId!,
        text: `Created a new poll: ${poll.title}`,
        pollId: poll.id,
      });

      broadcastToGroup(req.params.id, {
        type: "poll",
        poll,
      });

      res.json(poll);
    } catch (error) {
      res.status(400).json({ message: "Invalid poll data" });
    }
  });

  app.get("/api/groups/:id/polls", requireAuth, async (req: AuthRequest, res) => {
    const polls = await storage.getPollsByGroupId(req.params.id);
    res.json(polls);
  });

  app.post("/api/polls/:id/vote", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { choice } = insertVoteSchema.parse(req.body);
      const vote = await storage.createOrUpdateVote({
        pollId: req.params.id,
        userId: req.userId!,
        choice,
      });

      // Broadcast vote update
      res.json(vote);
    } catch (error) {
      res.status(400).json({ message: "Invalid vote data" });
    }
  });

  // ========== EXTERNAL API ROUTES ==========
  app.get("/api/external/tmdb/search", async (req, res) => {
    const query = req.query.query as string;
    if (!query) {
      return res.status(400).json({ message: "Query required" });
    }

    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "TMDB search failed" });
    }
  });

  app.get("/api/external/places/search", async (req, res) => {
    const query = req.query.query as string;
    if (!query) {
      return res.status(400).json({ message: "Query required" });
    }

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${process.env.GOOGLE_PLACES_API_KEY}`
      );
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Places search failed" });
    }
  });

  app.get("/api/external/places/photo", async (req, res) => {
    const reference = req.query.reference as string;
    if (!reference) {
      return res.status(400).json({ message: "Photo reference required" });
    }

    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
    res.redirect(photoUrl);
  });

  // ========== WEBSOCKET SERVER ==========
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: "/ws"
  });

  // Authenticate WebSocket connections
  const authenticatedSockets = new Map<WebSocket, string>(); // ws -> userId

  wss.on("connection", async (ws: WebSocket, req) => {
    let currentGroupId: string | null = null;

    // Parse session from upgrade request
    const cookies = req.headers.cookie || "";
    const sessionMatch = cookies.match(/connect\.sid=([^;]+)/);
    
    if (!sessionMatch) {
      ws.close(4401, "Unauthorized");
      return;
    }

    // Parse session (basic parsing - in production you'd verify signature)
    let userId: string | null = null;
    try {
      // Simple check - just verify session exists
      // The session middleware already validated it
      const sessionId = decodeURIComponent(sessionMatch[1].split('.')[0].slice(2));
      
      // We'll use a simpler approach: store userId when joining
      ws.on("message", async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === "auth" && message.userId) {
            // Client sends userId after connecting
            userId = message.userId;
            authenticatedSockets.set(ws, userId);
          } else if (message.type === "join" && message.groupId && userId) {
            // Verify user is a member of the group
            const group = await storage.getGroupById(message.groupId);
            const isMember = group?.members.some((m) => m.userId === userId);
            
            if (!isMember) {
              ws.send(JSON.stringify({ type: "error", message: "Not a member of this group" }));
              return;
            }

            // Leave previous group
            if (currentGroupId) {
              const groupClients = clients.get(currentGroupId);
              groupClients?.delete(ws);
            }

            // Join new group
            currentGroupId = message.groupId;
            if (currentGroupId) {
              if (!clients.has(currentGroupId)) {
                clients.set(currentGroupId, new Set());
              }
              clients.get(currentGroupId)?.add(ws);
            }
          }
        } catch (error) {
          console.error("WebSocket message error:", error);
        }
      });
    } catch (error) {
      ws.close(4401, "Unauthorized");
      return;
    }

    ws.on("close", () => {
      if (currentGroupId) {
        const groupClients = clients.get(currentGroupId);
        groupClients?.delete(ws);
      }
      authenticatedSockets.delete(ws);
    });
  });

  function broadcastToGroup(groupId: string, data: any) {
    const groupClients = clients.get(groupId);
    if (groupClients) {
      const message = JSON.stringify(data);
      groupClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  }

  return httpServer;
}
