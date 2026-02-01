
export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  cover?: string;
  bio?: string;
  friends: string[]; // IDs
  pendingRequests: string[]; // Received IDs
  sentRequests: string[]; // Sent IDs
}

export interface Story {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  image?: string;
  content?: string;
  timestamp: Date;
  seen?: boolean;
  reactions?: Record<string, string[]>; // emoji: [userIds]
}

export interface Contact {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline';
  lastMessage?: string;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: Date;
}

export interface Post {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  image?: string;
  video?: string;
  type?: 'general' | 'news' | 'video';
  likes: string[]; // User IDs
  comments: Comment[];
  timestamp: Date;
}

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'friend' | 'reaction';
  fromName: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'friend';
  text?: string;
  image?: string;
  timestamp: Date;
  reactions?: Record<string, string[]>; // emoji: [userIds]
}

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export type View = 'feed' | 'messaging' | 'profile' | 'notifications' | 'friends';
