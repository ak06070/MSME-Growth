export interface CardProps {
  title: string;
  description: string;
}

export const renderCardText = ({ title, description }: CardProps): string => {
  return `${title}: ${description}`;
};
