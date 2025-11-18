import React, { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAssistantStore, Message } from "../stores/assistantStore";
import { Send, Bot, User } from "lucide-react";

export const AIAssistantChat: React.FC = () => {
  const { token, tenantId } = useAuthStore();
  const { messages, addMessage, setMessages } = useAssistantStore();
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputText]);

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputText.trim(),
      role: "user",
      timestamp: new Date(),
    };

    addMessage(userMessage);
    setInputText("");
    setIsLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/chats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId || "",
        },
        body: JSON.stringify({
          message: userMessage.content,
          model: "gpt-3.5-turbo",
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error("Error al comunicarse con el asistente");
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.reply || "Lo siento, no pude procesar tu mensaje.",
        role: "assistant",
        timestamp: new Date(),
      };

      addMessage(assistantMessage);
    } catch (error) {
      console.error("Error sending message:", error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Lo siento, hubo un error al procesar tu mensaje. Por favor, inténtalo de nuevo.",
        role: "assistant",
        timestamp: new Date(),
      };

      addMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-2 py-4 pb-0">
        <div className="max-w-4xl mx-auto space-y-6 pb-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <Bot className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">¡Hola! Soy tu asistente IA</h3>
              <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">Puedo ayudarte con estrategias de marketing, ideas creativas, análisis de campañas y mucho más. ¿En qué puedo asistirte hoy?</p>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`flex items-start space-x-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" && (
                  <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center flex-shrink-0">
                    <Bot className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  </div>
                )}

                <div className={`max-w-3xl px-4 py-3 rounded-2xl ${message.role === "user" ? "bg-primary-600 text-white ml-12" : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-gray-700"}`}>
                  <div className="whitespace-pre-wrap break-words">{message.content}</div>
                  <div className={`text-xs mt-2 ${message.role === "user" ? "text-primary-100" : "text-gray-500 dark:text-gray-400"}`}>{formatTime(message.timestamp)}</div>
                </div>

                {message.role === "user" && (
                  <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-gray-700 px-4 py-3 rounded-2xl">
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">Escribiendo...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-4 mt-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end space-x-3">
            <div className="flex-1 relative">
              <textarea ref={textareaRef} value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyPress={handleKeyPress} placeholder="Escribe tu mensaje aquí... (Shift + Enter para nueva línea)" className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-2xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white resize-none min-h-[52px] max-h-32" disabled={isLoading} rows={1} />
            </div>
            <button onClick={sendMessage} disabled={!inputText.trim() || isLoading} className="p-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-2xl transition-colors disabled:cursor-not-allowed flex-shrink-0">
              <Send className="h-5 w-5" />
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">El asistente puede cometer errores. Verifica la información importante.</p>
        </div>
      </div>
    </div>
  );
};
