import { Routes } from '@angular/router';

export const CHAT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'chat-room' },
  {
    path: 'chat-room',
    title: 'Chat',
    loadComponent: () => import('./chat-room/chat-room.component').then(m => m.ChatRoomComponent),
  },
  {
    path: 'agent-console',
    title: 'Chat console',
    loadComponent: () => import('./agent-console/agent-console.component').then(m => m.AgentConsoleComponent),
  },
];
