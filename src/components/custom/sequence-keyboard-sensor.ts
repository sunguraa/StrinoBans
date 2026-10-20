import {
  getClientRect,
  KeyboardSensor,
  type KeyboardSensorOptions,
  type SensorInstance,
  type SensorProps,
} from '@dnd-kit/core';

// A vertical sequence needs synchronous listeners: the stock sensor defers them
// with a timer, which can miss real arrow/drop keys in a quick keyboard gesture.
export class SequenceKeyboardSensor implements SensorInstance {
  static activators = KeyboardSensor.activators;
  autoScrollEnabled = false;
  private readonly document: Document;
  private readonly window: Window;
  private readonly origin: { x: number; y: number };
  private finished = false;

  constructor(private readonly props: SensorProps<KeyboardSensorOptions>) {
    const node = props.activeNode.node.current;
    this.document = node?.ownerDocument ?? document;
    this.window = this.document.defaultView ?? window;
    node?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'instant',
    });
    const rect = node ? getClientRect(node, { ignoreTransform: true }) : null;
    this.origin = { x: rect?.left ?? 0, y: rect?.top ?? 0 };
    this.document.addEventListener('keydown', this.handleKeyDown);
    this.window.addEventListener('resize', this.cancel);
    this.document.addEventListener('visibilitychange', this.handleVisibility);
    props.onStart({ x: 0, y: 0 });
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (this.finished || event === this.props.event) return;
    const codes = this.props.options.keyboardCodes;
    if ((codes?.cancel ?? ['Escape']).includes(event.code)) {
      event.preventDefault();
      this.cancel();
      return;
    }
    if ((codes?.end ?? ['Space', 'Enter', 'Tab']).includes(event.code)) {
      event.preventDefault();
      this.detach();
      this.props.onEnd();
      return;
    }
    const context = this.props.context.current;
    const rect = context.collisionRect;
    const coordinates = this.props.options.coordinateGetter?.(event, {
      active: this.props.active,
      context,
      currentCoordinates: rect ? { x: rect.left, y: rect.top } : this.origin,
    });
    if (!coordinates) return;
    event.preventDefault();
    this.props.onMove({
      x: coordinates.x - this.origin.x,
      y: coordinates.y - this.origin.y,
    });
  };

  private handleVisibility = () => {
    if (this.document.hidden) this.cancel();
  };

  private cancel = () => {
    if (this.finished) return;
    this.detach();
    this.props.onCancel();
  };

  private detach() {
    this.finished = true;
    this.document.removeEventListener('keydown', this.handleKeyDown);
    this.window.removeEventListener('resize', this.cancel);
    this.document.removeEventListener(
      'visibilitychange',
      this.handleVisibility
    );
  }
}
