.PHONY: dash check

dash:
	bun install
	bun run dev

check:
	bunx tsc -b
	bun test
	uv run --no-project --with numpy python -I server/py/npz.py check
