import type { Metadata } from 'next';
import AccountClient from './AccountClient';

export const metadata: Metadata = { title: 'Account — Encounterizer' };

export default function AccountPage() {
  return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><AccountClient /></main>;
}
