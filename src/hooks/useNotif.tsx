import { notification } from "antd";
import { NotificationInstance } from "antd/es/notification/interface";
import React, { useMemo, ReactNode, useContext } from "react";

interface NotificationContextType {
  api: NotificationInstance;
}

const NotificationContext = React.createContext<NotificationContextType | null>(
  null
);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
}) => {
  const [api, contextHolder] = notification.useNotification();
  const contextValue = useMemo(() => ({ api }), [api]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {contextHolder}
      {children}
    </NotificationContext.Provider>
  );
};

type NotificationType = "success" | "info" | "warning" | "error";

const useNotif = () => {
  const context = useContext(NotificationContext);

  if (!context || !context.api) {
    throw new Error(
      "Notification API is not available. Ensure you are within a NotificationProvider."
    );
  }

  const open = (
    type: NotificationType,
    { message, description }: { message: string; description: string }
  ) => {
    context.api[type]({ message, description });
  };

  return open;
};

export default useNotif;
