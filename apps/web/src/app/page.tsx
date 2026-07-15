import { Suspense } from 'react';
import { Dashboard } from './dashboard';

// `Dashboard` reads view state from `useSearchParams`, which requires a Suspense boundary
// under static export (`output: 'export'`); the page-level loading fallback lands with the
// state views in a later section.
export default function Home() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
