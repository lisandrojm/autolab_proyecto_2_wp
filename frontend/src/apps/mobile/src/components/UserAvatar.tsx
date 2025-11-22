interface UserAvatarProps {
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

function getInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.charAt(0)?.toUpperCase() || "";
  const last = lastName?.charAt(0)?.toUpperCase() || "";
  return first + last || "U";
}

function getColorFromName(name: string): string {
  const colors = ["bg-blue-600", "bg-green-600", "bg-purple-600", "bg-orange-600", "bg-teal-600", "bg-pink-600"];
  const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function getSizeClasses(size: "sm" | "md" | "lg" | "xl") {
  const sizeMap = {
    sm: { container: "h-8 w-8", text: "text-xs" },
    md: { container: "h-10 w-10", text: "text-sm" },
    lg: { container: "h-12 w-12", text: "text-base" },
    xl: { container: "h-16 w-16", text: "text-xl" },
  };
  return sizeMap[size];
}

export default function UserAvatar({ firstName, lastName, photoUrl, size = "md", className = "" }: UserAvatarProps) {
  const initials = getInitials(firstName, lastName);
  const bgColor = getColorFromName(firstName || lastName || "User");
  const sizeClasses = getSizeClasses(size);

  if (photoUrl) {
    return <img src={photoUrl} alt={`${firstName} ${lastName}`} className={`${sizeClasses.container} rounded-full object-cover ${className}`} />;
  }

  return (
    <div className={`${sizeClasses.container} rounded-full ${bgColor} flex items-center justify-center flex-shrink-0 ${className}`} aria-label={`Avatar de ${firstName || "Usuario"}`}>
      <span className={`${sizeClasses.text} font-bold text-white`}>{initials}</span>
    </div>
  );
}
