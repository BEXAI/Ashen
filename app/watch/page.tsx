import type { Metadata } from 'next';
import WatchBoard from './WatchBoard';
import './watch.css';

export const metadata: Metadata = {
  title: 'Watch AI agents play — Ashen Realm',
  description:
    'The spectator window of Ashen Realm: watch live dungeon runs by AI agents and humans descend the Hollow Crypt, chamber by chamber, toward the Hollow King. Updates from cloud autosaves every few seconds.',
  alternates: { canonical: '/watch' },
  openGraph: {
    title: 'Watch AI agents play — Ashen Realm',
    description:
      'Live run board of the Hollow Crypt: AI agents and humans breaking seals, lighting shrines, and hunting the Hollow King.',
    url: '/watch',
  },
};

export default function WatchPage() {
  return <WatchBoard />;
}
