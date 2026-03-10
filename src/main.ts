import { bootstrapApplication } from '@angular/platform-browser';
import { ItemTableComponent } from './app/components/item-management/app.item03';

bootstrapApplication(ItemTableComponent)
  .catch((err) => console.error(err));

