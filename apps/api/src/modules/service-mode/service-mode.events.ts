import { EventEmitter } from "node:events";

import type { ServiceModeChangedEvent } from "./service-mode.types.js";

type ServiceModeEvents = {
  "service_mode.changed": ServiceModeChangedEvent;
};

class ServiceModeEventBus extends EventEmitter {
  emitEvent<K extends keyof ServiceModeEvents>(event: K, payload: ServiceModeEvents[K]) {
    queueMicrotask(() => {
      this.emit(event, payload);
    });
  }

  onEvent<K extends keyof ServiceModeEvents>(event: K, listener: (payload: ServiceModeEvents[K]) => void) {
    this.on(event, listener);
    return () => this.off(event, listener);
  }
}

export const serviceModeEventBus = new ServiceModeEventBus();
