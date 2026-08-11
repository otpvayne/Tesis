"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "@/modules/auth/actions";
import { authInitialState } from "@/modules/auth/state";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(signUp, authInitialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
        Crear cuenta
      </h1>

      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Correo electrónico
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded-md border border-neutral-300 px-4 py-3 text-base text-neutral-900 outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Contraseña
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-neutral-300 px-4 py-3 text-base text-neutral-900 outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60 dark:bg-neutral-50 dark:text-neutral-900"
      >
        {pending ? "Creando cuenta..." : "Crear cuenta"}
      </button>

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium underline">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
