"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/modules/auth/actions";
import { authInitialState } from "@/modules/auth/state";
import { Button } from "@/components/common/Button";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, authInitialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">Iniciar sesión</h1>

      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Correo electrónico
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded-md border border-neutral-300 px-4 py-3 text-base text-neutral-900 outline-none focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Contraseña
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-neutral-300 px-4 py-3 text-base text-neutral-900 outline-none focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-critical-600 dark:text-critical-400">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="font-medium text-brand-700 underline dark:text-brand-400">
          Regístrate
        </Link>
      </p>
    </form>
  );
}
