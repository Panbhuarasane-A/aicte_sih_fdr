import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.jsx';
import { announcementsRepo, notificationsRepo } from '../data/repositories.js';
import '../styles/notification-button.css';

export default function NotificationButton({ className }) {
  const navigate = useNavigate();
  const { user } = usePortal();
  const [notificationCount, setNotificationCount] = useState(0);
  const badgeClass = className === 'occ-notif-btn'
    ? 'occ-notif-badge'
    : className === 'ipc-notif-btn'
      ? 'ipc-notif-badge'
      : '';

  useEffect(() => {
    let mounted = true;
    const loadCount = async () => {
      try {
        const [announcementResult, notificationResults] = await Promise.all([
          announcementsRepo.list().catch(() => []),
          notificationsRepo.getSources(),
        ]);
        if (!mounted) return;

        const announcements = Array.isArray(announcementResult) ? announcementResult : [];
        if (user?.kind === 'institution') {
          setNotificationCount(announcements.length);
          return;
        }

        const [requests, claims, instruments] = notificationResults.map((result) => (
          result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []
        ));
        const pendingRequests = requests.filter((request) => (
          ['SUBMITTED', 'IN_SCRUTINY', 'RECOMMENDED'].includes(request.status)
        ));
        const actionClaims = claims.filter((claim) => (
          claim.match_result?.classification !== 'EXACT_MATCH' || claim.officer_decision === 'PENDING'
        ));
        const dueInstruments = instruments.filter((instrument) => (
          instrument.status !== 'released'
          && instrument.days_to_maturity != null
          && instrument.days_to_maturity <= 30
        ));
        setNotificationCount(
          announcements.length + pendingRequests.length + actionClaims.length + dueInstruments.length,
        );
      } catch {
        if (mounted) setNotificationCount(0);
      }
    };

    loadCount();
    return () => { mounted = false; };
  }, [user?.kind]);

  return (
    <button
      className={className}
      type="button"
      aria-label={notificationCount ? `${notificationCount} notifications` : 'No notifications'}
      title="Notifications"
      onClick={() => navigate(user?.kind === 'institution' ? '/institution-announcements' : '/notifications')}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {notificationCount > 0 && (
        <b className={`notification-count ${badgeClass}`}>{notificationCount > 99 ? '99+' : notificationCount}</b>
      )}
    </button>
  );
}
