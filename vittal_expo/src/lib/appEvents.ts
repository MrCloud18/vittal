type EventName = 'profileUpdated' | 'notificationsUpdated';

type Listener = () => void;

const listeners: Record<EventName, Set<Listener>> = {
  profileUpdated: new Set(),
  notificationsUpdated: new Set(),
};

export function onAppEvent(name: EventName, listener: Listener): () => void {
  listeners[name].add(listener);
  return () => listeners[name].delete(listener);
}

export function emitAppEvent(name: EventName): void {
  for (const listener of Array.from(listeners[name])) {
    listener();
  }
}
