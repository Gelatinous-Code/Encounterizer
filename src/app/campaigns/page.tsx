import type { Metadata } from 'next';
import CampaignsClient from './CampaignsClient';

export const metadata: Metadata = {
  title: 'Campaigns — Encounterizer',
  description: 'Private cloud campaigns with owner, DM, and player access.',
};

export default function CampaignsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <CampaignsClient />
    </div>
  );
}
