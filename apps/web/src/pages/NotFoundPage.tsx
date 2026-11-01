import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { PageContainer } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui/States';

export default function NotFoundPage() {
  return (
    <PageContainer>
      <EmptyState
        icon={<Compass className="h-6 w-6" />}
        title="No such section"
        description="This route does not exist in the console."
        action={
          <Link
            to="/"
            className="font-mono text-xs tracking-wider text-primary uppercase hover:underline"
          >
            Back to overview
          </Link>
        }
      />
    </PageContainer>
  );
}
