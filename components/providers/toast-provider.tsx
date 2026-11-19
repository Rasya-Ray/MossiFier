"use client";

import { ToastContainer } from "react-toastify";

export function ToastProvider() {
  return (
    <ToastContainer
      position="bottom-right"
      autoClose={3500}
      newestOnTop
      closeOnClick
      pauseOnHover
      theme="light"
      limit={3}
    />
  );
}
