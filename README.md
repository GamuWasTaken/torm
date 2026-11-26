
> [!NOTE]
> 
> | [<img src="https://raw.githubusercontent.com/NamtaoProductions/0rwx.com/108078203f642cdfc03fdfdc98a0cdc1561e8fa3/static/AI-W-dark.svg" width="40px" align="center">](http://0rwx.com) | AI:W I've selected the tech and architecture and fully reviewed each line of code but not written any. |
> | ----------------------- | ---------------------------------------------------------------------------------- |

# Torm

A small Solid + Vite app that renders Typst documents to SVG, generates a form from document inputs, and saves documents in browser localStorage.

## Run locally

```sh
pnpm install
pnpm dev
```

The Vite base path is `/torm/`, so open `http://localhost:5173/torm/`.

```sh
pnpm build
```

The build output is written to `dist/`. `.github/workflows/deploy.yaml` builds and deploys it to GitHub Pages on pushes to `master` or `main`.

## Defining inputs in `.typ` files

Declare inputs with a variable named `form-schema`, then attach it to `<form-schema>` metadata:

```typst
#let form-schema = (
  (name: "name", label: "Name", type: "text", default: "Ada"),
  (name: "copies", label: "Copies", type: "number", default: "3"),
  (name: "enabled", label: "Enabled", type: "boolean", default: "true"),
  (name: "language", label: "Language", type: "select", options: ("en", "fr", "es"), default: "en"),
  (name: "due", label: "Due date", type: "date", default: "2026-12-31"),
  (name: "notes", label: "Notes", type: "textarea", default: "First line\nSecond line"),
)
#metadata(form-schema) <form-schema>

#let name = sys.inputs.at("name", default: "Ada")
#let copies = int(sys.inputs.at("copies", default: "3"))
#let enabled = sys.inputs.at("enabled", default: "true") == "true"
```

Each schema entry supports these keys:

| Key       | Required | Description |
| --------- | -------- | ----------- |
| `name`    | yes      | Input name used in `sys.inputs`. Entries without a name are ignored. |
| `label`   | no       | Form label. Defaults to `name`. |
| `type`    | no       | One of the supported types below. Defaults to `text`. |
| `default` | no       | Initial form value as a string. Defaults to `""`. |
| `options` | no       | Select choices as a tuple of strings or a comma-separated string. |

Declared fields take precedence over inferred fields with the same name. See `all-input-types.typ` for a complete example.

## Supported types

| Type       | Form control | Value format | Typst usage |
| ---------- | ------------ | ------------ | ----------- |
| `text`     | text input   | any string   | `sys.inputs.at("name", default: "Ada")` |
| `number`   | number input | finite number string | `int(sys.inputs.at("copies", default: "3"))` |
| `boolean`  | checkbox     | `"true"` or `"false"` | `sys.inputs.at("enabled", default: "true") == "true"` |
| `select`   | select       | one of `options` | `sys.inputs.at("language", default: "en")` |
| `date`     | date picker  | real `YYYY-MM-DD` date | split the string and build `datetime(...)` |
| `textarea` | textarea     | any string, including newlines | `sys.inputs.at("notes", default: "First line\nSecond line")` |

All values are passed to Typst as strings. Convert or parse them inside the document as needed.

Date parsing example:

```typst
#let due-parts = sys.inputs.at("due", default: "2026-12-31").split("-").map(int)
#let due = datetime(year: due-parts.at(0), month: due-parts.at(1), day: due-parts.at(2))
```

Rendering pauses while `number`, `boolean`, or `date` inputs are empty or invalid, so incomplete form data does not trigger a Typst compile error.

## Inference without a declaration

If no declared fields are found, the app first queries metadata tagged `<form-schema>`, then infers fields from the document source:

- `sys.inputs.at("name", default: "Ada")` infers a `text` field.
- `int(...)` or `float(...)` around an input infers a `number` field.
- `bool(...)` around an input infers a `boolean` field.
- Direct field access such as `sys.inputs.name` infers a `text` field.

Inferred labels are the input names. Use an explicit `form-schema` declaration when you need custom labels, `select` options, `date`, or `textarea`. See `inferred-only.typ`.
