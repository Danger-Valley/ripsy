import type { Metadata } from 'next';
import { ShopAdminContent } from './shop-admin-content';

export const metadata: Metadata = { title: 'Shop administration | RIPSY', robots: { index: false, follow: false } };
export default function ShopAdminPage() { return <ShopAdminContent />; }
