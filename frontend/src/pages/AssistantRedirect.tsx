import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAssistantStore } from "../stores/assistantStore";

export const AssistantRedirect: React.FC = () => {
  const navigate = useNavigate();
  const { openAssistant } = useAssistantStore();

  useEffect(() => {
    openAssistant();
    navigate("/users", { replace: true });
  }, []);

  return null;
};
