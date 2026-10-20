import { Link } from 'react-router-dom';
import { IconHome, IconSearchOff } from '../components/Icons';

export function NotFoundPage() {
  return (
    <div className="page">
      <div className="empty-state">
        <span className="icon-tile icon-tile-lg">
          <IconSearchOff size={26} />
        </span>
        <h1>Page not found</h1>
        <p className="muted">This page doesn't exist or has moved.</p>
        <Link to="/" className="btn btn-primary">
          <IconHome size={15} /> Go to Home
        </Link>
      </div>
    </div>
  );
}
