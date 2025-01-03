import {
  Observable,
  ObservableMap,
  ObservableSet,
  ObservableStruct,
} from "@therapy/observable";

type Nullish<T> = T | null | undefined;

/**
 * An interface defining possible attributes on this WebComponent
 */
export type Attributes = Record<string, any> & {
  ref?: string;
} & Partial<HTMLElement>;

type Listener = { event: string; listener: (e: Event) => void };

/**
 * A base class for defining Web Components with additional convenience methods.
 *
 * @template T - A generic type extending `Attributes`.
 *               Allows strongly-typed attribute handling within the component.
 */
export class WebComponent<T extends Attributes = Attributes>
  extends HTMLElement {
  #listeners = new Set<Listener>();

  /**
   * Get or set an attribute on this component.
   *
   * If a `value` is provided, sets the attribute with the given `name` to that `value`.
   * If no `value` is provided, returns the current value of the attribute (or `null` if it doesn't exist).
   *
   * @example
   * ```ts
   * // Set an attribute:
   * this.attr('data-test', 'someValue');
   * // Get the attribute:
   * const val = this.attr('data-test');
   * ```
   * @param name - The attribute name to get or set.
   *                            Accepts either a key of `T` or a plain string.
   * @param value - The optional value to set for this attribute.
   * @returns The current (or newly set) value of the attribute, if it exists.
   */
  attr<K extends keyof T>(name: K | string, value?: string): string | null {
    if (typeof value === "string") this.setAttribute(name as string, value);

    return this.getAttribute(name as string);
  }

  /**
   * A convenience getter for accessing this element’s child HTML elements.
   *
   * @type {HTMLCollection}
   */
  get html(): HTMLCollection {
    return this.children;
  }

  /**
   * A convenience setter for replacing this element's children with a new HTMLElement.
   * After replacement, it calls a private method to reassign any `ref` bindings.
   *
   * @param newHtml - The new content for this component (replaces all existing children).
   */
  set html(newHtml: HTMLElement) {
    this.replaceChildren(newHtml);
    this.#findRefs();
  }

  /**
   * Overrides the default `addEventListener` to store details of the listener
   * in a private Set for cleanup later; otherwise functions exactly the same as `addEventListener`.
   * This helps remove all registered listeners in `disconnectedCallback` to avoid memory leaks.
   *
   * @param type - The event type (e.g., 'click', 'input', etc.).
   * @param listener - The callback function for the event.
   * @param [options] - Additional event listener options.
   */
  override addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.#listeners.add({
      event: type,
      listener: listener as Listener["listener"],
    });
    return super.addEventListener(type, listener, options);
  }

  #clearRefs() {
    Object.keys(this).forEach((key) => {
      if (!key.includes("$")) return;
      (this as any)[key] = null;
    });
  }

  #findRefs() {
    this.#clearRefs();

    const refs = this.querySelectorAll("[ref]");
    refs.forEach((ref) => {
      const refName = ref.getAttribute("ref")!;
      if (!(this as any)[refName]) (this as any)[refName] = ref;
    });
  }

  /**
   * Forcibly updates any refs in this WebComponent. If a ref's element cannot be found in this
   * element's markup, the ref will be assigned `null`.
   */
  updateRefs(): void {
    this.#findRefs;
  }

  /**
   * Called each time the element is appended into a document-connected element.
   * Custom setup logic can be placed here.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements#using_the_lifecycle_callbacks
   */
  connectedCallback() {}

  /**
   * Called each time the element is disconnected from the document’s DOM.
   * Cleans up all added event listeners and disposes of any Observable-like members
   * to prevent memory leaks or unintended side effects.
   */
  disconnectedCallback() {
    this.#listeners.forEach(({ event, listener }) => {
      this.removeEventListener(event, listener);
    });

    const mems = Object.values(this);

    mems.forEach((mem) => {
      const test = (x: any, y: any) => x instanceof y;
      if (
        !test(mem, Observable) &&
        !test(mem, ObservableMap) &&
        !test(mem, ObservableSet) &&
        !test(mem, ObservableStruct)
      ) {
        return;
      }

      mem.dispose();
    });
  }

  /**
   * Called each time the element is moved to a new document.
   * (For instance, after calling document.adoptNode on it.)
   */
  adoptedCallback() {}

  /**
   * Called when one of the element's attributes is changed, appended, removed, or replaced.
   * Note that you must specify which attributes to observe by defining a static
   * `observedAttributes` getter on the class.
   *
   * @param name - The attribute's local name.
   * @param oldValue - The old value of the attribute.
   * @param newValue - The new value of the attribute.
   */
  attributeChangedCallback() {}
}

type ElementCTor = (new (...args: any[]) => HTMLElement) & {
  componentName: string;
};

/**
 * Registers one or more Web Components (custom elements) with the browser’s
 * `customElements` registry.
 * If a component is already registered (checked by `componentName`), it won't be re-registered.
 *
 * Each component must have a static `componentName` property, used as the custom element's tag name.
 * @param components - One or more Web Component classes to register.
 */
export const registerComponents = (
  ...components: ElementCTor[]
): void => {
  components.forEach((component) => {
    if (!customElements.get(component.componentName)) {
      customElements.define(component.componentName, component);
    }
  });
};

/**
 * Traverses up the DOM tree, starting from the given `element`, looking for the
 * first ancestor that is an instance of the specified `parent` constructor.
 *
 * @param child - The DOM element from which to start the search upward.
 * @param parent - The constructor function (class) of the parent type to find.
 * @returns The nearest ancestor that is an instance of `parent`, or `null` if none is found.
 */
export const findParent = <T extends HTMLElement = HTMLElement>(
  child: HTMLElement,
  parent: typeof HTMLElement,
): Nullish<T> => {
  const getParent = (element: HTMLElement) => {
    return element.parentElement;
  };

  let parentEl = getParent(child);

  while (parentEl !== null) {
    if (parentEl instanceof parent) return parentEl as T;
    else if (parentEl === null) return null;
    else parentEl = getParent(parentEl);
  }

  return null;
};
