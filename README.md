# FriendFlow

**FriendFlow** is a modern, real-time, collaborative event planning application designed to make organizing hangouts with friends seamless and fun. It combines group chat with an intelligent polling system and an AI-powered assistant to streamline decision-making.

## Features

- **Real-Time Group Chat**: Instant messaging within groups.
- **AI-Powered Planning (PlanBot)**: A chatbot that helps plan events.
- **Collaborative Polling**: Create polls for movies and places.
- **User Authentication**: Secure email/password authentication.
- **Profile Customization**: Personalize user profiles.
- **Dark & Light Mode**: Theme support for user preference.

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Backend**: Appwrite (Authentication, Realtime Database, Storage)
- **Styling**: Tailwind CSS, shadcn/ui
- **State Management**: TanStack Query
- **APIs**: TMDB, OpenStreetMap, OpenAI

## Project Structure

The project follows a standard Vite + React project structure.

```text
/
├── public/              # Static assets
├── src/
│   ├── components/      # Reusable UI components (shadcn/ui)
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Core logic, API clients, and providers
│   ├── pages/           # Top-level page components
│   ├── App.tsx          # Main app component with routing
│   ├── main.tsx         # Entry point of the application
│   └── index.css        # Global styles and Tailwind directives
├── .env.example         # Environment variable template
├── package.json         # Project dependencies and scripts
└── README.md            # You are here
```

## Appwrite Database Schema

The backend is powered by Appwrite. Here are the collections and their important attributes:

- **`users`** (Managed by Appwrite)

  - `name` (string): User's display name.
  - `prefs`: User-specific preferences (e.g., profile info).

- **`groups`**

  - `name` (string): The name of the group.
  - `description` (string): A short description of the group.
  - `inviteCode` (string): Unique code to join the group.
  - `members` (string[]): An array of user IDs.

- **`messages`**

  - `groupId` (string): The group this message belongs to.
  - `userId` (string): The user who sent the message.
  - `content` (string): The text of the message.
  - `isSystemMessage` (boolean): `true` if the message is from PlanBot.

- **`polls`**

  - `groupId` (string): The group this poll belongs to.
  - `question` (string): The poll question (e.g., "Which movie?").
  - `options` (string[]): JSON string of poll options.
  - `type` (string): "movie" or "place".
  - `isActive` (boolean): `true` if the poll is currently active.

- **`votes`**
  - `pollId` (string): The poll this vote is for.
  - `userId` (string): The user who voted.
  - `option` (string): The option the user voted for.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- An Appwrite instance

### Installation & Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/aman-yadav-ds/FriendFlow.git
   cd FriendFlow
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**

   Create a `.env` file in the root of the project and add the necessary variables. You can use the `.env.example` file as a template.

4. **Run the development server:**

   ```bash
   npm run dev
   ```

## User Guide

FriendFlow is designed to be intuitive, but here’s a detailed guide to get you started and make the most of every feature.

### 1. Getting Started: Authentication

First, you need an account to start planning.

- **Register**: If you're a new user, click on the "Register" link. You'll need to provide your name, a valid email address, and a password.
- **Login**: If you already have an account, simply enter your email and password to sign in.

### 2. The Dashboard: Your Central Hub

After logging in, you'll land on the dashboard. This is where you can manage all your groups.

- **Creating a Group**:
  1. Click the "Create Group" button.
  2. Give your group a name and an optional description.
  3. A unique **invite code** will be generated. Share this code with your friends so they can join.
- **Joining a Group**:
  1. Click the "Join Group" button.
  2. Enter the invite code you received from a friend.
  3. You'll be added to the group and can start chatting immediately.
- **Accessing a Group**: Simply click on any group card on your dashboard to enter the group chat.

### 3. Group Chat & Manual Polling

The group chat is where all the communication and planning happens.

- **Real-Time Messaging**: Send and receive messages instantly. You can also react to messages with emojis to quickly share your feelings.
- **Creating a Manual Poll**:
  1. Inside the chat, click the **"Create Poll"** button.
  2. You have two choices:
     - **Movie Poll 🎬**: Perfect for movie nights. Start typing a movie title, and the app will fetch suggestions from The Movie Database (TMDB). Select the movies you want to include as options.
     - **Place Poll 📍**: Ideal for choosing a location. Search for restaurants, parks, or any other place. The app uses OpenStreetMap to find locations. Select the places you want to add as poll options.
  3. Once you've added your options, create the poll. It will appear in the chat for everyone to vote on.

### 4. Using the AI PlanBot 🤖

PlanBot is your AI assistant for effortless planning. To use it, type commands starting with `/` or `!` in the chat.

- **/plan [activity]**: Kicks off the planning process.
  - **Example**: `/plan cafe`
  - **What it does**: PlanBot analyzes the recent chat history to understand your group's preferences (e.g., "a quiet spot," "good WiFi"). It then finds local cafes, ranks them based on those preferences, and creates a poll with the top 3 AI-recommended options.
- **/when [date/time]**: Helps the group decide on the best time to meet.
  - **Example**: `/when tomorrow at 8pm`
  - **What it does**: Creates a poll with several time slots around the suggested time for the group to vote on.
- **/rsvp**: Allows members to confirm their attendance.
  - **Example**: `/rsvp`
  - **What it does**: Any member can use this command to signal they are coming to the planned event.
- **/lock**: Finalizes the plan.
  - **Example**: `/lock`
  - **What it does**: An admin can use this command to "lock in" the winning option from a poll (e.g., the cafe with the most votes). The bot can then post a summary of the final plan.
- **/help**: Shows a list of all available commands.

### 5. Profile Management

Customize your profile to let your friends know more about you.

1. Navigate to the **Profile** page from the main menu.
2. Here you can:
   - Change your profile picture.
   - Update your name and bio.
   - Add your favorite movie genres to help with future recommendations.

## Deployment

This project is configured for easy deployment to modern hosting platforms like Vercel and Netlify.

### Deploying with Vercel

1. **Fork this repository** to your own GitHub account.
2. Go to your [Vercel Dashboard](https://vercel.com/dashboard) and click **"Add New... > Project"**.
3. **Import** the forked repository from your GitHub account.
4. Vercel will automatically detect that this is a Vite project and configure the build settings.
5. Before deploying, go to the **"Settings" > "Environment Variables"** tab for the project.
6. Add all the necessary environment variables from your `.env` file (e.g., `VITE_APPWRITE_ENDPOINT`, `VITE_APPWRITE_PROJECT_ID`, etc.).
7. Click **"Deploy"**. Vercel will build and deploy your site.

### Deploying with Netlify

1. **Fork this repository** to your own GitHub account.
2. Go to your [Netlify Team Dashboard](https://app.netlify.com) and click **"Add new site > Import an existing project"**.
3. **Connect to GitHub** and authorize Netlify to access your repositories.
4. **Select** the forked repository.
5. Netlify will detect the Vite configuration. The build command should be `npm run build` and the publish directory should be `dist`.
6. Before deploying, go to **"Site settings" > "Build & deploy" > "Environment"**.
7. Add all the necessary environment variables from your `.env` file.
8. Click **"Deploy site"**.
