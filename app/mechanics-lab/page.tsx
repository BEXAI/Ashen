import { notFound } from 'next/navigation';
import MechanicsLab from '../game/MechanicsLab';

/** Development-only isolated fixture; never loads or writes a saved journey. */
export default function Page() {
  if (!import.meta.env.DEV) notFound();
  return <MechanicsLab />;
}
