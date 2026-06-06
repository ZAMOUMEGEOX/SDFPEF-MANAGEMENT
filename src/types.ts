import type React from 'react';

export type ViewState = 'dashboard' | 'contentieux' | 'police' | 'biodiversite' | 'teledetection' | 'domaine' | 'settings' | 'drone';

export interface NavItem {
  id: ViewState;
  label: string;
  icon: React.ElementType;
}
