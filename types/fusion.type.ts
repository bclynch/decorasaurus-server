import { ProductOrientation, ProductSize } from './product.type';

export interface Fusion {
  id: string;
  orderId: string;
  type: 'udnie' | 'rain_princess' | 'scream' | 'wave' | 'wreck' | 'la_muse';
  orientation: ProductOrientation;
  size: ProductSize;
  cropUrl: string;
}
