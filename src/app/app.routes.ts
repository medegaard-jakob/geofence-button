import { Routes } from '@angular/router';
import { Tracker } from './tracker/tracker';
import { ZonesEditor } from './zones/zones-editor';

export const routes: Routes = [
  { path: '', component: Tracker, title: 'Geofence Button' },
  { path: 'zones', component: ZonesEditor, title: 'Areas · Geofence Button' },
  { path: '**', redirectTo: '' },
];
