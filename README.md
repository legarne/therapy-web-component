# @therapy/web-component

[![JSR](https://jsr.io/badges/@therapy/web-component)](https://jsr.io/@therapy/web-component)

## Description

@therapy/web-component adds some bonus functionality to native HTML web components and some quality of life features
for web development.

## Permissions

@therapy/web-component does not require any additional permissions.

@therapy/web-component/build-types requires the following permissions:

- read
- write
- run

## Installation

```bash
deno add jsr:@therapy/web-component

# Builds a components.d.ts type file that contains the types of your web components
# Recommended to use with the watch flag in your src directory
deno run -A --watch=./src jsr:@therapy/web-component/build-types src
```

### Usage and Examples

#### Basic Usage

_See the [Web Component](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) documentation for more information about
web component usage._

Any class that extends from `WebComponent` will also extend from `HTMLElement`. This type
of class should also have a static member of the component's name.

```ts
import { WebComponent, registerComponents } from "@therapy/web-component";

class TestComponent extends WebComponent {
  static componentName = "test-component";

  connectedCallback() {
    /* ... */
  }
}

export default TestComponent;

// in ./main.ts
registerComponents(TestComponent);
```

The `registerComponents` function will handle registering the component to the `customElements` window object (though make sure this function is actually called in your application,
perhaps in a bootstrap function). From then on, the web component's tag will be available.

```ts
document.body.append(`<test-component></test-component>`);
```

_It is recommended to use [@therapy/jsx](https://jsr.io/@therapy/jsx) with `@therapy/web-component`,
but it isn't required. Examples will show a mixture of both._

#### WebComponent.html

`WebComponent.html` is a convenience function to work with elements, in contrast to `HTMLElement.innerHTML` working with strings.
As a setter, it will replace this element's html content, and as a getter, return this element's `HTMLCollection`.

```tsx
class ExampleComp extends WebComponent {
  static componentName = "example-comp";

  connectedCallback() {
    const text = document.createElement("span");
    text.innerText = "Hello";

    this.html = text;

    // with @therapy/jsx
    // this.html = <span>Hello</span>;

    console.log(this.html); // [HTMLSpanElement]
  }
}
```

#### Refs

`ref` is a special prop that any element created may have. It will automatically
assign the members' value to the element _after_ any `WebComponent.html` call. Refs **must**
be prepended with `$`

```tsx
class RefExample extends WebComponent {
  static componentName = "ref-example";

  $title: HTMLSpanElement;

  connectedCallback() {
    console.log(this.$title); // null
    this.html = <span ref={"$title"} />;

    console.log(this.$title); // HTMLSpanElement

    this.$title.innerText = "Changed by ref";
  }
}
```

Refs are always updated after a call to `html`. Note that `html` and `innerHTML` are different properties.
Refs provide an easy way to access markup elements without needing to use `querySelector` or similar, though
those are still valid approaches and are sometimes appropriate.

`WebComponent.updateRefs()` will forcibly update any refs if you require refs to be updated at some point after an `html` call.

#### WebComponent Props

The `WebComponent` class accepts properties by generic interface that describe what props are allowed,
including default `HTMLElement` props. Props provided by interface must be listed as a member variable.
It is recommended to disable the strict initializer property in `compilerOptions`.

```jsonc
// deno.json
{
  "compilerOptions": {
    "strictPropertyInitialization": false,
  },
}
```

An example:

```tsx
interface IExampleProps {
  count?: number;
  onCountChange?: (count: number) => void;
}

class Example extends WebComponent<IExampleProps> {
  static componentName = "el-example";

  $counterEl: HTMLSpanElement;

  count: number = 0;
  onCountChange?: (count: number) => void;

  connectedCallback() {
    this.html = (
      <div>
        <span ref={"$counterEl"}>{count}</span>
        <button
          onclick={() => {
            this.count++;
            this.$counterEl.innerText = `${this.count}`;
            if (this.onCountChange) this.onCountChange(this.count);
          }}
        />
      </div>
    );
  }
}

document.body.append(
  <el-example
    count={0}
    onCountChange={(count: number) => console.log("count changed", count)}
  />,
);
```

Some props undergo attribute coercion if it is applicable. For instance, strings and booleans are
allowed by the HTML specification as attributes on an element:

```tsx
<some-element
  someProp={"hello, world"}
  isAlive
  doSomething={() => {
    /* ... */
  }}
/>
```

In this case, `someProp` and `isAlive` are also available in the element's attributes, by
`element.attributes` or `element.getAttribute('someProp')`, but `doSomething` is not because it cannot be
safely cast to a string or boolean. `doSomething` is still available as a member, however:

```tsx
const element: SomeElement = (
  <some-element
    someProp={"hello, world"}
    isAlive
    doSomething={() => {
      /* ... */
    }}
  />
);
console.log(element.doSomething); // Function
```

#### Observables

Web Components have first class support for `@therapy/observable` and work nicely with them. Changing the counter example from above:

```tsx
interface IExampleProps {
  count?: number;
  onCountChange?: (count: number) => void;
}

class Counter extends WebComponent<IExampleProps> {
  static componentName = "ex-counter";

  $counterEl: HTMLSpanElement;

  protected _count = new Observable(0);
  get count() {
    return this._count.value;
  }
  set count(num: number) {
    this._count.value = num;
  }

  onCountChange?: (count: number) => void;

  connectedCallback() {
    this.html = (
      <div>
        <span ref={"$counterEl"}>{count}</span>
      </div>
    );

    this._count.listen(() => {
      this.$counterEl.innerText = `${this.count}`;
      if (this.onCountChange) this.onCountChange(this.count);
    });
  }
}

const counter: Counter = <ex-counter count={10} />;
document.body.append(
  <div>
    {counter}
    <button
      onclick={() => {
        counter.count++;
      }}
    >
      Click Me
    </button>
  </div>,
);
```

Like this, web components can expose their "stateful" members, and other parts of the application
can easily modify them without having to worry about contexts, stores, or prop drilling.

#### Resource Disposal

WebComponents will automatically dispose most references that could dangle after disconnection.
Most notably, any handlers added by `addEventListener` will be freed automatically when the element is deleted or moved.
Note above the `protected _count = new Observable(0)` in the counter example. Observables that are marked by the protected access
modifier (or public) will also be automatically disposed, along with event handlers added by `addEventListener`.

These operations happen during the `disconnectedCallback`, so if that callback is needed, make sure to call its super.

```ts
class C extends WebComponent<any> {
  disconnectedCallback() {
    super.disconnectedCallback();

    this.cleanup();
  }
}
```

## License

MIT
