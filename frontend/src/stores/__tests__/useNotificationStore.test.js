/**
 * @file useNotificationStore.test.js
 * @description Tests for src/stores/useNotificationStore.js
 */
import useNotificationStore from '../../stores/useNotificationStore';

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
    });
  });

  test('initial state is empty', () => {
    const state = useNotificationStore.getState();
    expect(state.notifications).toEqual([]);
    expect(state.unreadCount).toBe(0);
  });

  test('setUnreadCount updates count', () => {
    useNotificationStore.getState().setUnreadCount(5);
    expect(useNotificationStore.getState().unreadCount).toBe(5);
  });

  test('addNotification prepends and increments count', () => {
    const notif = { id: 1, message: 'Test notification', type: 'info' };
    useNotificationStore.getState().addNotification(notif);

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toEqual(notif);
    expect(state.unreadCount).toBe(1);
  });

  test('addNotification prepends (newest first)', () => {
    useNotificationStore.getState().addNotification({ id: 1, message: 'first' });
    useNotificationStore.getState().addNotification({ id: 2, message: 'second' });

    const state = useNotificationStore.getState();
    expect(state.notifications[0].id).toBe(2);
    expect(state.notifications[1].id).toBe(1);
    expect(state.unreadCount).toBe(2);
  });

  test('addNotification caps at 50 notifications', () => {
    for (let i = 0; i < 55; i++) {
      useNotificationStore.getState().addNotification({ id: i, message: `notif ${i}` });
    }
    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(50);
    // Most recent should be first
    expect(state.notifications[0].id).toBe(54);
  });

  test('markAllRead resets unread count to 0', () => {
    useNotificationStore.getState().setUnreadCount(10);
    useNotificationStore.getState().markAllRead();
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  test('clearAll resets everything', () => {
    useNotificationStore.getState().addNotification({ id: 1, message: 'test' });
    useNotificationStore.getState().addNotification({ id: 2, message: 'test2' });

    useNotificationStore.getState().clearAll();
    const state = useNotificationStore.getState();
    expect(state.notifications).toEqual([]);
    expect(state.unreadCount).toBe(0);
  });
});
