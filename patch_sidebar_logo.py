path = "src/components/Sidebar.tsx"
with open(path) as f:
    content = f.read()

old_block = '''<Link href="/dashboard" className="px-4 mb-6 cursor-pointer block" onClick={onClose}>
          <span className="text-2xl font-extrabold text-emerald-400">
            A & S Afiliados
          </span>
        </Link>'''

new_block = '''<Link href="/dashboard" className="px-4 mb-6 cursor-pointer block" onClick={onClose}>
          <Image src="/logo.png" alt="A&S Afiliados" width={150} height={74} priority />
        </Link>'''

if old_block in content:
    content = content.replace(old_block, new_block)
    print("OK: logo del sidebar reemplazado")
else:
    print("ERROR: no se encontro el bloque exacto")

with open(path, "w") as f:
    f.write(content)
