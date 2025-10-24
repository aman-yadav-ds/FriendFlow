# Smart Event Planning Web App

## Overview

A social event planning web application that enables groups of friends to coordinate activities through real-time chat, polling, and voting. The app features a modern, responsive interface inspired by Discord, WhatsApp, and Doodle, with support for creating movie or location-based polls and collaborative decision-making.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18 with TypeScript using Vite as the build tool
- Client-side routing via Wouter (lightweight alternative to React Router)
- State management using React Context for authentication and React Query for server state
- Form handling with React Hook Form and Zod validation

**UI Component System**
- Radix UI primitives for accessible, unstyled components
- shadcn/ui component library with New York style preset
- Tailwind CSS for styling with custom design tokens and CSS variables
- Framer Motion for animations and transitions
- Custom theming system supporting light/dark modes via next-themes pattern

**Design System**
- Typography: Inter (primary) and Plus Jakarta Sans (display) via Google Fonts
- Consistent spacing using Tailwind's 4-6-8-12-16 scale
- Card-based layouts with defined container widths (max-w-md for auth, max-w-7xl for full sections)
- Custom color system using HSL values with CSS variables for theme switching
- Hover and active states with elevation effects (`--elevate-1`, `--elevate-2`)

### Backend Architecture

**Server Framework**
- Express.js with TypeScript running on Node.js
- HTTP server creation with WebSocket support via ws library
- Session-based authentication using express-session with PostgreSQL session store
- Password hashing via bcrypt

**API Design**
- RESTful endpoints under `/api` namespace
- WebSocket connections for real-time features (chat messages, voting updates)
- File upload handling with Multer (5MB limit, stored in local uploads directory)
- Request logging middleware capturing method, path, duration, and response preview

**Authentication & Authorization**
- Session-based auth with server-side session storage in PostgreSQL
- Password comparison using bcrypt for secure credential verification
- Protected routes requiring authenticated user session
- Session data extends to include userId for user identification

### Data Storage

**Database**
- PostgreSQL via Neon serverless driver
- Drizzle ORM for type-safe database operations and schema management
- Schema-first design with migration support via Drizzle Kit

**Data Models**
- Users: id, name, email, password (hashed), avatar, bio, timestamps
- Groups: id, name, inviteCode (unique), createdBy, timestamps
- GroupMembers: junction table with composite unique constraint on (groupId, userId)
- Messages: id, groupId, userId, content, timestamp with user relationship
- Polls: id, groupId, title, pollType (movie/place), options (JSONB), createdBy, timestamps
- Votes: id, pollId, userId, optionIndex with composite unique constraint
- Reactions: id, messageId, userId, emoji with composite unique constraint

**Schema Patterns**
- UUID primary keys using PostgreSQL's gen_random_uuid()
- Cascade deletes on foreign key relationships
- JSONB fields for flexible data structures (poll options)
- Drizzle-Zod integration for runtime validation schemas

### Real-Time Features

**WebSocket Implementation**
- ws library for WebSocket server attached to HTTP server
- Client connection management via Map<string, Set<WebSocket>> for group-based broadcasting
- Event-based messaging for chat, polls, votes, and reactions
- Automatic reconnection handling on client side

**Real-Time Events**
- New messages broadcast to all group members
- Poll creation and vote updates
- Reaction additions to messages
- Typing indicators (implementation ready)

## External Dependencies

### Third-Party Services

**Movie Data**
- TMDB (The Movie Database) API for movie search and details
- Endpoint: `/api/external/tmdb/search`
- Returns: title, overview, poster_path, release_date, vote_average

**Location Data**
- Google Places API for location search and details
- Endpoint: `/api/external/places/search` (implementation pending)
- Returns: place_id, name, formatted_address, photos, rating, types

### UI Libraries & Tools

**Component Libraries**
- @radix-ui/* primitives (accordion, alert-dialog, avatar, checkbox, dialog, dropdown-menu, etc.)
- @emoji-mart for emoji picker functionality
- cmdk for command palette interface
- vaul for drawer components

**Utilities**
- class-variance-authority (cva) for component variant management
- clsx and tailwind-merge for conditional className composition
- @tanstack/react-query for server state management and caching
- Lucide React for iconography

### Development Tools

**Build & Development**
- Vite with React plugin and runtime error overlay
- Replit-specific plugins: cartographer, dev-banner (development only)
- esbuild for production server bundling
- tsx for TypeScript execution in development

**Type Safety & Validation**
- TypeScript with strict mode enabled
- Zod for runtime schema validation
- Drizzle-Zod for database schema validation integration

### Environment Configuration

**Required Variables**
- `DATABASE_URL`: PostgreSQL connection string (Neon serverless)
- `SESSION_SECRET`: Secret for session encryption (required in production)
- `NODE_ENV`: Environment flag (development/production)

**Optional Variables**
- TMDB API key (for movie search functionality)
- Google Places API key (for location search functionality)