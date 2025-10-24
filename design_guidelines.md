# Design Guidelines: Smart Event Planning Web App

## Design Approach

**Reference-Based Design** drawing from leading social and productivity platforms:
- **Discord**: Clean chat interface, member sidebar, organized channels
- **WhatsApp**: Minimalist message bubbles, intuitive conversation flow
- **Doodle**: Simple polling interface with clear visual voting
- **Notion**: Card-based layouts, clean typography hierarchy

**Core Principles**: Social-first design emphasizing clarity, real-time feedback, and joyful interactions for group coordination.

---

## Typography System

**Font Stack**: Google Fonts via CDN
- **Primary**: Inter (400, 500, 600, 700) - UI elements, chat, buttons
- **Display**: Plus Jakarta Sans (600, 700) - headers, page titles

**Hierarchy**:
- **Hero/Page Titles**: text-4xl md:text-5xl font-bold (Plus Jakarta Sans)
- **Section Headers**: text-2xl md:text-3xl font-semibold
- **Card Titles**: text-lg font-semibold
- **Body Text**: text-base font-normal
- **Metadata/Timestamps**: text-sm text-gray-500
- **Buttons**: text-sm font-medium uppercase tracking-wide

---

## Layout & Spacing System

**Tailwind Units**: Consistent use of **4, 6, 8, 12, 16** for spacing
- **Component Padding**: p-4 or p-6 for cards
- **Section Spacing**: py-12 md:py-16 for page sections
- **Gap Between Elements**: gap-4 or gap-6 in grids
- **Input/Button Height**: h-12 for consistency

**Container Widths**:
- **Full-width sections**: max-w-7xl mx-auto px-4
- **Chat messages**: max-w-4xl
- **Auth cards**: max-w-md
- **Dashboard grids**: max-w-6xl

---

## Page-Specific Layouts

### Authentication Pages (/auth/login, /auth/register)
- **Layout**: Centered card on full-height page
- **Card**: max-w-md, rounded-2xl, shadow-xl, p-8
- **Structure**: Logo at top, form inputs stacked with gap-6, primary button, link to alternate auth page
- **Animations**: Card fades up on mount (Framer Motion)

### Dashboard (/dashboard)
- **Header Bar**: Sticky top bar with user avatar (right), greeting, search bar (w-96)
- **Group Grid**: 3-column grid on desktop (grid-cols-1 md:grid-cols-2 lg:grid-cols-3), gap-6
- **Group Cards**: Rounded-xl cards with group name, member count, last message preview, hover lift effect
- **FAB**: Fixed bottom-right floating button (+ New Group) with shadow-2xl

### Group Chat (/groups/[groupId])
- **Three-Column Layout**:
  - **Left Sidebar** (w-64, hidden on mobile): Group name header, member avatars list, invite link button at bottom
  - **Main Chat** (flex-1): Header with group name + member count, scrollable message area, bottom input bar (sticky)
  - **Right Panel** (w-80, toggle on tablet): Active poll display, voting controls
  
- **Message Bubbles**: 
  - Own messages: ml-auto, max-w-lg, rounded-2xl (flat right edge)
  - Others: mr-auto, max-w-lg, rounded-2xl (flat left edge)
  - Include avatar (h-10 w-10) for others, timestamp below
  - Emoji reactions as floating badges below bubble

- **Input Bar**: Fixed bottom, backdrop-blur, flex layout with emoji picker button, text input (flex-1), send button

### Poll Page (/groups/[groupId]/poll)
- **Creation View**: Centered form (max-w-2xl), type selector (movie/place) as large toggle buttons, search input with live results below as cards (grid-cols-2)
- **Active Poll View**: 
  - **Poll Card**: Large featured card with image (aspect-video), title overlay, vote buttons below (grid-cols-3)
  - **Vote Breakdown**: Stacked list showing who voted what, with avatars
  - **Live Count**: Animated number badges showing Join (primary), Maybe (secondary), Not Joining counts

### Profile Page (/profile)
- **Two-Column Layout** (single column mobile):
  - **Left**: Avatar preview (h-48 w-48, rounded-full), upload button below, user stats
  - **Right**: Edit form with inputs for name, bio (textarea), email (disabled)
- **Action Bar**: Save button (primary), cancel (secondary) at bottom

---

## Component Library

### Navigation
- **Top Bar**: h-16, sticky top-0, backdrop-blur, flex items-center justify-between, px-6
- **Sidebar**: Fixed left, w-64, border-right, pt-4

### Cards
- **Standard Card**: rounded-xl, shadow-md, p-6, hover:shadow-lg transition
- **Poll Card**: rounded-2xl, overflow-hidden, aspect-video image with gradient overlay for text
- **Group Card**: rounded-xl, p-4, flex items-center gap-4, cursor-pointer

### Forms & Inputs
- **Text Input**: h-12, rounded-lg, px-4, border, focus:ring-2 focus:ring-offset-2
- **Button Primary**: h-12, px-8, rounded-lg, font-medium, shadow-md, hover:shadow-lg
- **Button Secondary**: h-12, px-6, rounded-lg, border
- **Vote Buttons**: h-14, rounded-xl, flex-1, font-semibold, with icon

### Chat Elements
- **Message Bubble**: py-3 px-4, rounded-2xl, max-w-lg, shadow-sm
- **Emoji Reaction**: inline-flex, h-8, px-2, rounded-full, items-center gap-1
- **Typing Indicator**: Three animated dots in bubble

### Modals
- **Overlay**: Fixed inset-0, backdrop-blur-sm
- **Modal Card**: max-w-2xl, rounded-2xl, p-8, shadow-2xl, centered via flex

### Voting Interface
- **Vote Button**: Grid of 3 equal buttons, h-16, rounded-xl, with icon + label, active state with ring
- **Vote Count Badge**: Circular badge (h-12 w-12), absolute top-right on button

---

## Icons
**Library**: Lucide React via CDN
- **Message**: MessageCircle
- **Poll**: BarChart3
- **Vote**: ThumbsUp, ThumbsDown, Minus (Maybe)
- **Group**: Users
- **Send**: Send
- **Emoji**: Smile
- **Profile**: User
- **Settings**: Settings

---

## Animation Specifications

**Framer Motion Usage** (subtle, purposeful):
- **Page Transitions**: Fade + slide up (y: 20 → 0), duration 0.3s
- **Message Entry**: Slide from right (own) or left (others), spring animation
- **Modal Open/Close**: Scale from 0.95 → 1, opacity 0 → 1, duration 0.2s
- **Vote Selection**: Button scale 1 → 1.05 on click, bounce back
- **Emoji Reactions**: Pop in with spring (scale 0 → 1.2 → 1)
- **Card Hover**: Subtle lift (y: 0 → -4px), shadow increase
- **Live Updates**: Pulse animation on new vote/message (1 pulse only)

**Performance**: Use will-change sparingly, prefer CSS transforms, limit concurrent animations

---

## Images

### Required Images:
1. **Auth Pages Background**: Abstract gradient pattern or soft geometric shapes (full viewport, fixed)
2. **Poll Cards**: Dynamic images from TMDB (movie posters) and Google Places (location photos) - aspect-video format
3. **User Avatars**: Circular (uploaded to Appwrite Storage), fallback to initials with generated background
4. **Empty States**: Illustration for "No groups yet" on dashboard, "No messages" in chat
5. **Group Placeholder**: Default group icon if no custom image set

**No large hero image** - this is a utility-focused app, not marketing

---

## Responsive Strategy

**Breakpoints**:
- **Mobile** (base): Single column, hidden sidebars, bottom sheet for members
- **Tablet** (md: 768px): Two-column layout, collapsible sidebars
- **Desktop** (lg: 1024px): Full three-column layout, persistent sidebars

**Mobile-Specific**:
- Sticky bottom navigation for main actions
- Swipe gestures for sidebar reveal
- Full-screen modals instead of centered cards
- Touch-optimized button sizes (min-h-12)